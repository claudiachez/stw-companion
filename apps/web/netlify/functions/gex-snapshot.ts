/**
 * GEX Snapshot — scheduled writer for the Macro tab's GEX / Positioning module.
 *
 * Source: the SPX Gamma Edge newsletter (spxgammaedge.substack.com), a free,
 * publicly readable, twice-daily report on SPX dealer gamma. We read the public
 * RSS feed, pick the latest report for the session (`PREMARKET REPORT.` in the
 * morning, `END OF SESSION REPORT.` after the close), strip the post body to
 * plain text, and extract the factual "Structural Read" levels via the pure
 * parseGammaEdgeReport (@stw/shared). One row per session (am/pm) is upserted
 * into `gex_snapshots` as symbol='SPX'; every client + macro-snapshot read that
 * table. We surface only the factual numeric levels with attribution — never the
 * newsletter's prose (host terms, 2026-07-11).
 *
 * Why a scheduled writer + a table (not a per-browser fetch): keeps one canonical
 * cross-device row and avoids every client hitting the feed. No API key, no rate
 * limit — the feed is public and carries the full body in content:encoded.
 *
 * The row is tagged with the REPORT's own ET date (not "today"), so a weekend or
 * holiday run simply re-upserts the last trading day's row — idempotent, never a
 * stale overwrite.
 *
 * Schedule 32 12,23 * * 1-5 UTC: 12:32 (= 8:32am ET, to run alongside the AM recap;
 * after the ~12:12 premarket publish) and 23:32 (after the ~23:22 end-of-session
 * publish). The report is UTC-published, so the fixed-UTC am fire lands after it in
 * either DST season; the displayed "Updated" stamp is the report's own `as_of`, not the
 * fire time. Env: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY only (no FlashAlpha key).
 */
import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { parseGammaEdgeReport, gexSleeveScore, type GammaEdgeKind } from '@stw/shared';

const FEED_URL = 'https://spxgammaedge.substack.com/feed';
const SYMBOL = 'SPX';

interface FeedItem { title: string; link: string; pubDate: string; content: string }

/** Split the RSS into <item> blocks and pull the CDATA fields we need (no XML dep). */
function parseFeed(xml: string): FeedItem[] {
  return xml.split('<item>').slice(1).map((chunk) => {
    const block = chunk.split('</item>')[0];
    const field = (tag: string): string => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      if (!m) return '';
      return m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    };
    return { title: field('title'), link: field('link'), pubDate: field('pubDate'), content: field('content:encoded') };
  });
}

/** Strip the post HTML to the plain text parseGammaEdgeReport expects. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#8217;/g, "'").replace(/&#8211;/g, '-').replace(/&#8482;/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .replace(/[ \t]+/g, ' ');
}

async function sbUpsert(url: string, key: string, table: string, row: Record<string, unknown>, onConflict: string): Promise<string | null> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) return (await res.text()).slice(0, 200);
  return null;
}

async function sbInsert(url: string, key: string, table: string, row: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch { /* run_log is best-effort — never let a logging failure mask the real result */ }
}

// Trading-day guard — shared market calendar (migration 068) via is_trading_day.
// Weekends already excluded by the cron (`* 1-5`); this catches NYSE holidays.
// Fails OPEN if the RPC is unavailable.
async function isTradingDay(url: string, key: string, dateStr: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/is_trading_day`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ d: dateStr }),
    });
    if (!res.ok) return true;
    return (await res.json()) !== false;
  } catch { return true; }
}

/** ET calendar date (yyyy-MM-dd) for a Date. */
function etDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

const handlerImpl: Handler = async () => {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const runLogBase = { run_type: 'gex-snapshot' };

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }) };
  }

  // Don't ingest on a market holiday (a report-date-tagged upsert would just be a
  // no-op re-write of the last trading day's row anyway — this skips the work).
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (!(await isTradingDay(supabaseUrl, serviceKey, todayET))) {
    await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'ok', messages_processed: 0, summary: `skipped ${todayET} — not a trading day` });
    return { statusCode: 200, body: JSON.stringify({ skipped: todayET, reason: 'not a trading day' }) };
  }

  // Session by UTC hour: 12:45 → am (premarket), 23:45 → pm (end-of-session).
  const session: 'am' | 'pm' = new Date().getUTCHours() < 18 ? 'am' : 'pm';
  const kind: GammaEdgeKind = session === 'am' ? 'premarket' : 'eod';
  // The newsletter renamed its reports in the 2026-07 redesign: "PREMARKET REPORT." →
  // "Premarket Brief.", "END OF SESSION REPORT." → "End of Session" (both still carry the
  // QUICK READ / Key Levels block). Match the new titles first, keep the old as fallback.
  const titleMatch = session === 'am' ? /Premarket Brief|PREMARKET REPORT/i : /End of Session|END OF SESSION REPORT/i;

  try {
    const res = await fetch(FEED_URL, { headers: { 'User-Agent': 'STW-Companion/1.0 (macro GEX ingest)', Accept: 'application/rss+xml, application/xml' } });
    if (!res.ok) {
      const detail = `SPX Gamma Edge feed HTTP ${res.status}`;
      await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'error', messages_processed: 0, summary: detail });
      return { statusCode: 502, body: JSON.stringify({ error: detail }) };
    }

    const items = parseFeed(await res.text());
    const item = items.find((i) => titleMatch.test(i.title));
    if (!item) {
      const detail = `No ${kind} report found in feed (${items.length} items scanned)`;
      await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'error', messages_processed: 0, summary: detail });
      return { statusCode: 502, body: JSON.stringify({ error: detail }) };
    }

    const report = parseGammaEdgeReport(htmlToText(item.content), kind);
    // Guard against a silent format drift — if the two fields the sleeve depends
    // on are both missing, treat it as a parse failure rather than writing blanks.
    if (report.gammaFlip == null && report.spot == null) {
      const detail = `Parsed ${kind} report but found no gamma flip / spot — feed format may have changed (${item.link})`;
      await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'error', messages_processed: 0, summary: detail });
      return { statusCode: 500, body: JSON.stringify({ error: detail }) };
    }

    const sleeve = gexSleeveScore(report.spot, report.gammaFlip);
    // Tag with the report's own ET date (idempotent across weekend/holiday reruns).
    const pub = new Date(item.pubDate);
    const snapshotDate = Number.isNaN(pub.getTime()) ? etDate(new Date()) : etDate(pub);
    const asOf = Number.isNaN(pub.getTime()) ? new Date().toISOString() : pub.toISOString();

    const upsertError = await sbUpsert(supabaseUrl, serviceKey, 'gex_snapshots', {
      snapshot_date: snapshotDate,
      session,
      symbol: SYMBOL,
      underlying_price: report.spot,
      gamma_flip: report.gammaFlip,
      net_gex: report.netGex,
      net_gex_label: report.netGexLabel,
      call_wall: report.callWall,
      put_wall: report.putWall,
      sleeve_score: sleeve,
      as_of: asOf,
      raw: { source: 'spx-gamma-edge', kind, title: item.title, link: item.link, ...report },
    }, 'symbol,snapshot_date,session');

    if (upsertError) {
      await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'error', messages_processed: 0, summary: `upsert failed for ${snapshotDate}/${session}: ${upsertError}` });
      return { statusCode: 500, body: JSON.stringify({ error: upsertError }) };
    }

    await sbInsert(supabaseUrl, serviceKey, 'run_log', {
      ...runLogBase, status: 'ok', messages_processed: 1,
      summary: `wrote SPX GEX ${snapshotDate}/${session} (flip ${report.gammaFlip}, spot ${report.spot}, sleeve ${sleeve}) from ${kind} report`,
    });
    return { statusCode: 200, body: JSON.stringify({ snapshotDate, session, sleeve, report }) };
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'error', messages_processed: 0, summary: `threw: ${detail}`.slice(0, 500) });
    return { statusCode: 500, body: JSON.stringify({ error: detail }) };
  }
};

export const handler = schedule('32 12,23 * * 1-5', handlerImpl);
