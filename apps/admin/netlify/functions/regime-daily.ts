/**
 * regime_daily writer — plans/integrity-guardrails.md Item 3.
 *
 * Two modes, same function (shares the same TwelveData fetch + rolling-stat
 * computation so there is exactly one code path, not a backfill script that
 * silently drifts from the daily-append logic):
 *
 *   - Daily mode (default, no query params): computes + upserts just the most
 *     recent trading day for every tracked instrument. Intended to run on a
 *     schedule after market close (added to netlify.toml once verified).
 *   - Backfill mode (`?backfill=1&days=N`): computes + upserts the last N
 *     trading days from whatever history TwelveData returns in one call.
 *     TwelveData's outputsize cap (5000) limits a single call to roughly the
 *     trailing ~19-20 years, short of the spec's ~2000-present ask — walking
 *     further back needs `?before=YYYY-MM-DD` across additional invocations
 *     (each one is its own TwelveData credits, subject to the free tier's
 *     rate limit — see maCache.ts's header comment on that limit). This is
 *     the "spread over multiple quota cycles" approach the operator approved.
 *
 * Deliberately separate from macro-snapshot.ts / macro_daily_snapshots — do
 * not merge this with the Macro Dashboard composite (standing prohibition).
 * `packages/shared/src/utils/regime.ts` (regimeGate, sma, rocPositive, etc.)
 * is the only shared code; no import from macro.ts.
 *
 * Direct REST fetch only (no @supabase/supabase-js — crashes Node 20 Netlify
 * Functions, see CLAUDE.md Conventions). Same run_log instrumentation
 * standard as macro-snapshot.ts (Item 0): every invocation logs ok/fail, rows
 * written, error detail — a silent no-op is treated as a defect, not a rest day.
 */
import type { Handler } from '@netlify/functions';
import {
  REGIME_GATE_CONFIG, trendStateFromClose, volStateFromVix,
  sma, rocPositive, smaSlopePositive, realizedVolAnnualized, percentileRankOf,
  buildFredUrl, parseFredObservations, FRED_SERIES,
} from '@stw/shared';

const TREND_INSTRUMENTS = ['IWM', 'SPY', 'QQQ'];

interface Bar { date: string; close: number }

// VIX / VIX3M / US10Y now come from FRED (VIXCLS / VXVCLS / DGS10) — free,
// authoritative, and VXVCLS finally makes vol_state real instead of 'UNKNOWN'
// (TwelveData's free tier didn't reliably serve VIX3M). DGS10 is already a
// percent, so the old ×10 TNX normalization is gone. Equity trend instruments
// stay on TwelveData. FRED has no 5000-row cap, so backfill can pull deep history
// in one call, ending the window at `endDate` (the backfill cursor).
async function fredBars(seriesId: string, key: string, limit: number, endDate?: string): Promise<Bar[]> {
  try {
    const res = await fetch(buildFredUrl(seriesId, key, limit, endDate));
    if (res.ok) return parseFredObservations(await res.json());
  } catch { /* ignore — caller handles empty */ }
  return [];
}

async function tdSeries(symbol: string, key: string, outputsize: number, endDate?: string): Promise<Bar[]> {
  const endParam = endDate ? `&end_date=${endDate}` : '';
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${outputsize}&timezone=UTC${endParam}&apikey=${key}`;
  try {
    const d = await (await fetch(url)).json() as { status?: string; values?: { datetime: string; close: string }[] };
    if (d.status === 'ok' && d.values?.length) {
      return [...d.values].reverse().map((v) => ({ date: v.datetime.slice(0, 10), close: parseFloat(v.close) }));
    }
  } catch { /* ignore — caller handles empty */ }
  return [];
}

async function sbUpsertMany(url: string, key: string, table: string, rows: Record<string, unknown>[], onConflict: string): Promise<string | null> {
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

export const handler: Handler = async (event) => {
  const twelveDataKey = (process.env.VITE_TWELVEDATA_KEY ?? process.env.TWELVEDATA_KEY ?? '').trim();
  const fredKey = (process.env.FRED_API_KEY ?? '').trim();
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!supabaseUrl || !serviceKey || !twelveDataKey || !fredKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TWELVEDATA_KEY / FRED_API_KEY' }) };
  }

  const qs = event.queryStringParameters ?? {};
  const isBackfill = qs.backfill === '1';
  const daysRequested = isBackfill ? Math.max(1, parseInt(qs.days ?? '30', 10)) : 1;
  const beforeDate = qs.before; // optional cursor for walking further back across invocations
  // Need enough history for the 504-day percentile window + the days actually being written.
  const outputsize = Math.min(5000, 504 + daysRequested + 5);

  const runLogBase = { run_type: 'regime-daily' };

  try {
    const [vixBars, vix3mBars, tnxBars] = await Promise.all([
      fredBars(FRED_SERIES.vix, fredKey, outputsize, beforeDate),
      fredBars(FRED_SERIES.vix3m, fredKey, outputsize, beforeDate),
      fredBars(FRED_SERIES.us10y, fredKey, outputsize, beforeDate),
    ]);
    const vix3mAvailable = vix3mBars.length > 0;

    const vixByDate = new Map(vixBars.map((b) => [b.date, b.close]));
    const vix3mByDate = new Map(vix3mBars.map((b) => [b.date, b.close]));
    // DGS10 is already a percent (e.g. 4.25) — no normalization needed.
    const tnxByDate = new Map(tnxBars.map((b) => [b.date, b.close]));

    const rows: Record<string, unknown>[] = [];
    let rowsWritten = 0;

    for (const instrument of TREND_INSTRUMENTS) {
      const bars = await tdSeries(instrument, twelveDataKey, outputsize, beforeDate);
      if (!bars.length) continue;
      const closesAll = bars.map((b) => b.close);
      const n = closesAll.length;
      const daysToWrite = Math.min(daysRequested, n);

      for (let i = n - daysToWrite; i < n; i++) {
        const closesUpToToday = closesAll.slice(0, i + 1);
        const date = bars[i].date;
        const close = closesUpToToday[closesUpToToday.length - 1];
        const sma200 = sma(closesUpToToday, REGIME_GATE_CONFIG.smaWindow);
        const trend_state = trendStateFromClose(close, sma200);
        const vix = vixByDate.get(date) ?? null;
        const vix3m = vix3mAvailable ? (vix3mByDate.get(date) ?? null) : null;
        const vol_state = volStateFromVix(vix, vix3m);
        const tnx = tnxByDate.get(date) ?? null;
        const tnxIdx = tnxBars.findIndex((b) => b.date === date);
        const tnx63Ago = tnxIdx >= 63 ? tnxBars[tnxIdx - 63].close : null;

        // 504-day realized-vol percentile window ending the day before `date`.
        const rvWindowCloses = closesUpToToday.slice(0, -1);
        const rv20 = realizedVolAnnualized(closesUpToToday, 20);
        const rvSeries: number[] = [];
        if (rvWindowCloses.length >= REGIME_GATE_CONFIG.percentileWindow + 20) {
          for (let j = rvWindowCloses.length - REGIME_GATE_CONFIG.percentileWindow; j < rvWindowCloses.length; j++) {
            const v = realizedVolAnnualized(rvWindowCloses.slice(0, j + 1), 20);
            if (v !== null) rvSeries.push(v);
          }
        }
        const rv20Pctl = rv20 !== null && rvSeries.length ? percentileRankOf(rv20, rvSeries) : null;

        rows.push({
          trading_date: date,
          instrument,
          close,
          sma200,
          trend_state,
          roc_252d_positive: rocPositive(closesUpToToday, REGIME_GATE_CONFIG.rocWindow),
          sma200_slope_positive: smaSlopePositive(closesUpToToday, REGIME_GATE_CONFIG.smaWindow, REGIME_GATE_CONFIG.slopeWindow),
          rv20_annualized: rv20,
          rv20_percentile_2y: rv20Pctl,
          vix_close: vix,
          vix3m_close: vix3m,
          vix_ratio: vix !== null && vix3m !== null && vix3m !== 0 ? vix / vix3m : null,
          vol_state: vix3mAvailable ? vol_state : 'UNKNOWN',
          tnx_level: tnx,
          tnx_63d_change_positive: tnx !== null && tnx63Ago !== null ? tnx > tnx63Ago : null,
          source: 'twelvedata+fred',
          engine_version: REGIME_GATE_CONFIG.engine_version,
        });
      }
    }

    const upsertError = await sbUpsertMany(supabaseUrl, serviceKey, 'regime_daily', rows, 'trading_date,instrument');
    rowsWritten = upsertError ? 0 : rows.length;

    if (upsertError) {
      await sbInsert(supabaseUrl, serviceKey, 'run_log', {
        ...runLogBase, status: 'error', messages_processed: 0,
        summary: `upsert failed (${rows.length} candidate rows): ${upsertError}`,
      });
      return { statusCode: 500, body: JSON.stringify({ error: upsertError }) };
    }

    await sbInsert(supabaseUrl, serviceKey, 'run_log', {
      ...runLogBase, status: 'ok', messages_processed: rowsWritten,
      summary: `wrote ${rowsWritten} regime_daily rows (${isBackfill ? `backfill days=${daysRequested}` : 'daily'}, engine ${REGIME_GATE_CONFIG.engine_version})` +
        (vix3mAvailable ? '' : ' — VIX3M unavailable from TwelveData this run; vol_state written as UNKNOWN, never guessed.'),
    });

    return { statusCode: 200, body: JSON.stringify({ rowsWritten, vix3mAvailable }) };
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await sbInsert(supabaseUrl, serviceKey, 'run_log', {
      ...runLogBase, status: 'error', messages_processed: 0,
      summary: `threw: ${detail}`.slice(0, 500),
    });
    return { statusCode: 500, body: JSON.stringify({ error: detail }) };
  }
};
