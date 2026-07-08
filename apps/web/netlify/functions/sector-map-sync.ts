/**
 * sector-map-sync — keeps ticker_sector_map current as new positions open.
 *
 * The map was hand-seeded once; nothing repopulated it, so a freshly-opened
 * ticker (e.g. CCXI) had no sector until someone re-seeded by hand. This
 * scheduled writer closes that gap: it finds holdings tickers missing from
 * ticker_sector_map, resolves each to its canonical GICS bucket, and upserts.
 *
 * Resolution (resolveSector in @stw/shared): a TICKER_GICS override first
 * (non-equity CASH/ARKK/SQQQ + any equity corrections), else Finnhub profile2's
 * finnhubIndustry folded to GICS. An unresolved ticker is LEFT unmapped (logged,
 * never guessed) — the Risk tab shows it as 'unevaluated' until it resolves.
 *
 * Existing rows are not touched — the one-off GICS re-seed (migration 062)
 * handles those. Direct REST fetch only (no @supabase/supabase-js — CLAUDE.md).
 * run_log-instrumented, same standard as macro-snapshot/regime-daily.
 */
import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { resolveSector, runPaced, FEED_LIMITS } from '@stw/shared';

async function sbSelect<T>(url: string, key: string, path: string): Promise<T[]> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`select ${path} → HTTP ${res.status}`);
  return await res.json() as T[];
}

async function sbUpsert(url: string, key: string, table: string, rows: Record<string, unknown>[], onConflict: string): Promise<string | null> {
  if (!rows.length) return null;
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) return (await res.text()).slice(0, 300);
  return null;
}

async function sbInsert(url: string, key: string, table: string, row: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch { /* run_log is best-effort */ }
}

async function finnhubIndustry(symbol: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`);
    if (!res.ok) return null;
    const d = await res.json() as { finnhubIndustry?: string };
    return d.finnhubIndustry ?? null;
  } catch { return null; }
}

const handlerImpl: Handler = async () => {
  const finnhubKey = (process.env.VITE_FINNHUB_KEY ?? process.env.FINNHUB_KEY ?? '').trim();
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }) };
  }

  const runLogBase = { run_type: 'sector-map-sync' };
  try {
    const holdings = await sbSelect<{ ticker: string }>(supabaseUrl, serviceKey, 'holdings?select=ticker');
    const mapped = await sbSelect<{ ticker: string }>(supabaseUrl, serviceKey, 'ticker_sector_map?select=ticker');
    const have = new Set(mapped.map((m) => m.ticker));
    const missing = [...new Set(holdings.map((h) => h.ticker).filter((t) => t && !have.has(t)))];

    if (missing.length === 0) {
      await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'ok', messages_processed: 0, summary: 'no unmapped tickers' });
      return { statusCode: 200, body: JSON.stringify({ added: 0, unresolved: [] }) };
    }

    // Resolve each missing ticker: TICKER_GICS override first (no network), else
    // Finnhub profile2 fold. Only the Finnhub path is paced (rare + few symbols).
    const resolved: { ticker: string; sector: string }[] = [];
    const unresolved: string[] = [];
    await runPaced(missing, async (ticker) => {
      let sector = resolveSector(ticker);
      if (!sector) {
        const label = finnhubKey ? await finnhubIndustry(ticker, finnhubKey) : null;
        sector = resolveSector(ticker, label);
      }
      if (sector) resolved.push({ ticker, sector }); else unresolved.push(ticker);
      return ticker;
    }, FEED_LIMITS.finnhub);

    const upsertError = await sbUpsert(supabaseUrl, serviceKey, 'ticker_sector_map',
      resolved.map((r) => ({ ticker: r.ticker, sector: r.sector })), 'ticker');

    if (upsertError) {
      await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'error', messages_processed: 0, summary: `upsert failed: ${upsertError}` });
      return { statusCode: 500, body: JSON.stringify({ error: upsertError }) };
    }

    await sbInsert(supabaseUrl, serviceKey, 'run_log', {
      ...runLogBase, status: 'ok', messages_processed: resolved.length,
      summary: `mapped ${resolved.length}: ${resolved.map((r) => `${r.ticker}→${r.sector}`).join(', ')}`
        + (unresolved.length ? ` · UNRESOLVED (left for review): ${unresolved.join(', ')}` : ''),
    });
    return { statusCode: 200, body: JSON.stringify({ added: resolved.length, resolved, unresolved }) };
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'error', messages_processed: 0, summary: `threw: ${detail}`.slice(0, 500) });
    return { statusCode: 500, body: JSON.stringify({ error: detail }) };
  }
};

// Weekdays 22:00 UTC (~5–6pm ET) — after the routines have written the day's
// new holdings, so a freshly-opened position gets a sector the same evening.
export const handler = schedule('0 22 * * 1-5', handlerImpl);
