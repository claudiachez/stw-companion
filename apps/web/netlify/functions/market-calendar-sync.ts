/**
 * Market-calendar sync — auto-populates the shared `market_holidays` table
 * (migration 068) so the trading calendar extends forever with no yearly manual
 * edit. Computes NYSE closures in-house via nyseHolidays (@stw/shared) — no
 * external feed, no key — for the current year + the next two, and upserts them
 * (idempotent on holiday_date). The migration seed is only the bootstrap; this
 * keeps the table ahead of the calendar.
 *
 * Runs monthly (self-healing if a run is missed). Not gated on trading days — the
 * calendar must stay current regardless. Env: VITE_SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY.
 */
import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { nyseHolidays } from '@stw/shared';

async function sbUpsertMany(url: string, key: string, rows: Record<string, unknown>[]): Promise<string | null> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/market_holidays?on_conflict=holiday_date`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) return (await res.text()).slice(0, 200);
  return null;
}

async function sbInsert(url: string, key: string, row: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${url.replace(/\/$/, '')}/rest/v1/run_log`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch { /* run_log is best-effort */ }
}

const handlerImpl: Handler = async () => {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const runLogBase = { run_type: 'market-calendar-sync' };

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }) };
  }

  try {
    const thisYear = new Date().getUTCFullYear();
    const years = [thisYear, thisYear + 1, thisYear + 2];
    const rows = years.flatMap((y) => nyseHolidays(y)).map((h) => ({ holiday_date: h.date, name: h.name }));

    const err = await sbUpsertMany(supabaseUrl, serviceKey, rows);
    if (err) {
      await sbInsert(supabaseUrl, serviceKey, { ...runLogBase, status: 'error', messages_processed: 0, summary: `upsert failed: ${err}` });
      return { statusCode: 500, body: JSON.stringify({ error: err }) };
    }

    await sbInsert(supabaseUrl, serviceKey, {
      ...runLogBase, status: 'ok', messages_processed: rows.length,
      summary: `synced ${rows.length} NYSE holidays for ${years.join(', ')}`,
    });
    return { statusCode: 200, body: JSON.stringify({ years, count: rows.length }) };
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await sbInsert(supabaseUrl, serviceKey, { ...runLogBase, status: 'error', messages_processed: 0, summary: `threw: ${detail}`.slice(0, 500) });
    return { statusCode: 500, body: JSON.stringify({ error: detail }) };
  }
};

// 1st of each month, 09:00 UTC — self-heals if a run is missed; cheap.
export const handler = schedule('0 9 1 * *', handlerImpl);
