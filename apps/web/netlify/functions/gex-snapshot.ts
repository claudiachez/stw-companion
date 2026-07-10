/**
 * GEX Snapshot — scheduled writer for the Macro tab's GEX / Positioning module.
 *
 * Fetches SPY gamma exposure from FlashAlpha (GET /v1/exposure/gex/SPY), derives
 * the display levels + the regime GEX-sleeve score (@stw/shared), and upserts one
 * row per session (am/pm) into `gex_snapshots` (migration 067). Every client + the
 * macro-snapshot writer read that table — the browser NEVER calls FlashAlpha
 * directly, because the free tier is 5 requests/DAY (this writer spends ~2/day).
 *
 * Free-tier constraints (documented, accepted): SPY only (index proxy — a paid key
 * unlocks SPX with no code change), and a SINGLE expiry per call (full-chain needs
 * the Growth plan), so we request the nearest upcoming Friday.
 *
 * Runs on one site only (web) to avoid double-spending the daily quota — the admin
 * site reads the same Supabase table. Env: FLASHALPHA_API_KEY (server-side, no
 * VITE_) + the usual VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 *
 * Schedule 30 12,20 * * 1-5 UTC ≈ 8:30am / 4:30pm ET (pre- and post-market). DST
 * shifts the wall-clock hour by one but never past a session boundary — same fixed-
 * UTC tradeoff already accepted by macro-snapshot.ts.
 */
import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { deriveGexLevels, gexSleeveScore, type FlashAlphaGexResponse } from '@stw/shared';

const SYMBOL = 'SPY';

/** Nearest upcoming Friday (incl. today if it's Friday), ET, as yyyy-MM-dd. */
function nearestFriday(): string {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const add = (5 - etNow.getDay() + 7) % 7; // days until Friday (0 if today is Friday)
  const target = new Date(etNow);
  target.setDate(etNow.getDate() + add);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

const handlerImpl: Handler = async () => {
  const apiKey = (process.env.FLASHALPHA_API_KEY ?? '').trim();
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }) };
  }

  const snapshotDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const session = new Date().getUTCHours() < 16 ? 'am' : 'pm';
  const runLogBase = { run_type: 'gex-snapshot' };

  if (!apiKey) {
    await sbInsert(supabaseUrl, serviceKey, 'run_log', {
      ...runLogBase, status: 'error', messages_processed: 0,
      summary: 'Missing FLASHALPHA_API_KEY — add it to the web site env.',
    });
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing FLASHALPHA_API_KEY' }) };
  }

  try {
    const expiration = nearestFriday();
    const res = await fetch(`https://lab.flashalpha.com/v1/exposure/gex/${SYMBOL}?expiration=${expiration}`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
    });
    if (!res.ok) {
      const detail = `FlashAlpha HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`;
      await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'error', messages_processed: 0, summary: detail });
      return { statusCode: 502, body: JSON.stringify({ error: detail }) };
    }

    const raw = await res.json() as FlashAlphaGexResponse;
    const levels = deriveGexLevels(raw);
    const sleeve = gexSleeveScore(levels.spot, levels.gammaFlip);

    const upsertError = await sbUpsert(supabaseUrl, serviceKey, 'gex_snapshots', {
      snapshot_date: snapshotDate,
      session,
      symbol: SYMBOL,
      underlying_price: levels.spot,
      gamma_flip: levels.gammaFlip,
      net_gex: levels.netGex,
      net_gex_label: levels.netGexLabel,
      call_wall: levels.callWall,
      put_wall: levels.putWall,
      sleeve_score: sleeve,
      as_of: levels.asOf || new Date().toISOString(),
      raw,
    }, 'symbol,snapshot_date,session');

    if (upsertError) {
      await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'error', messages_processed: 0, summary: `upsert failed for ${snapshotDate}/${session}: ${upsertError}` });
      return { statusCode: 500, body: JSON.stringify({ error: upsertError }) };
    }

    await sbInsert(supabaseUrl, serviceKey, 'run_log', {
      ...runLogBase, status: 'ok', messages_processed: 1,
      summary: `wrote SPY GEX for ${snapshotDate}/${session} (flip ${levels.gammaFlip}, sleeve ${sleeve}, exp ${expiration})`,
    });
    return { statusCode: 200, body: JSON.stringify({ snapshotDate, session, sleeve, levels }) };
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'error', messages_processed: 0, summary: `threw: ${detail}`.slice(0, 500) });
    return { statusCode: 500, body: JSON.stringify({ error: detail }) };
  }
};

export const handler = schedule('30 12,20 * * 1-5', handlerImpl);
