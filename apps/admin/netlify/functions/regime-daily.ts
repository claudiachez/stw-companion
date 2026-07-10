/**
 * regime_daily writer — plans/integrity-guardrails.md Item 3.
 *
 * Two modes, same function (shares the same fetch + rolling-stat computation so
 * there is exactly one code path, not a backfill script that silently drifts
 * from the daily-append logic):
 *
 *   - Daily mode (default, no query params): computes + upserts just the most
 *     recent trading day for every tracked instrument. Runs on the cron below
 *     (`schedule('0 23 * * 1-5', …)`) after market close.
 *   - Backfill mode (`?backfill=1&days=N`): computes + upserts the last N
 *     trading days from whatever history the equity source returns in one call.
 *     Two equity sources, selected by `?source=`:
 *       · TwelveData (default) — the daily-cron source. `outputsize` caps at
 *         5000 (~19-20 years), short of the spec's ~2000-present ask; walking
 *         further back needs `?before=YYYY-MM-DD` across additional invocations
 *         (each its own TwelveData credits — see maCache.ts's rate-limit note).
 *       · Yahoo (`?source=yahoo`) — free, no key, decades of daily bars in ONE
 *         call (SPY 1996, QQQ 1999, IWM 2000). This is the depth backfill to
 *         ~2000-present (plans/20260709_regime_daily_depth_extension.md); rows
 *         get `source='yahoo+fred'`. Uses the UNADJUSTED close (matches
 *         TwelveData's basis to the cent, so the on_conflict merge over existing
 *         rows is a no-op). Changes only the SOURCE of the equity bars, never the
 *         regime math (engine frozen at 1.1.0). FRED (VIX/VIX3M/US10Y) has no
 *         cap, so its index fields are pulled deep enough to align.
 *         (The plan named Stooq; it has since added a JS proof-of-work anti-bot
 *          wall a serverless fetch can't clear — Yahoo meets every requirement
 *          and reconciles exactly. See yahooSeries().)
 *
 * NOTE — once this is a scheduled function, Netlify no longer exposes it over
 * public HTTP (a scheduled fn only fires on its cron; the UI "Run now" button
 * sends no querystring, so it only triggers daily mode). Backfill therefore runs
 * via the CLI against Netlify Dev — `netlify functions:invoke --name regime-daily
 * --querystring "backfill=1&days=500"` — or a local node harness that calls this
 * same handler with a synthetic `queryStringParameters`. Both hit the identical
 * code path; the "one function, one code path" intent is preserved.
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
import { schedule } from '@netlify/functions';
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

// Yahoo Finance chart API — free, no API key, decades of daily history in ONE
// call (SPY from 1996, QQQ from 1999, IWM from 2000). The depth backfill
// (`?source=yahoo`) routes here instead of TwelveData because TwelveData's
// 5000-bar cap + 1-credit/symbol tier is exactly what makes reaching ~2000
// painful; FRED (VIX/VIX3M/US10Y) already has no cap. We read the UNADJUSTED
// close (`indicators.quote[].close`, NOT adjclose) — that matches TwelveData's
// basis to the cent, so the on_conflict merge over the existing 2020-present
// rows reproduces identical closes → identical trend/vol classifications
// (verified against stored SPY rows before the backfill). Returns the SAME Bar
// shape as tdSeries so the compute loop and upsert are reused verbatim — this
// changes only the SOURCE of the equity bars, never the regime math (engine 1.1.0).
//
// (The plan named Stooq; Stooq has since added a JS proof-of-work anti-bot wall
//  a serverless fetch can't clear. Yahoo meets every functional requirement —
//  free, keyless, deep, one call, not TwelveData — and reconciles exactly.)
async function yahooSeries(symbol: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=30y&interval=1d`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const d = await res.json() as {
      chart?: { result?: [{ timestamp?: number[]; indicators?: { quote?: [{ close?: (number | null)[] }] } }] };
    };
    const r = d.chart?.result?.[0];
    const ts = r?.timestamp;
    const closes = r?.indicators?.quote?.[0]?.close;
    if (!ts || !closes || ts.length !== closes.length) return [];
    const bars: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const close = closes[i];
      if (close == null || Number.isNaN(close)) continue; // Yahoo nulls holidays/half-days
      const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      bars.push({ date, close });
    }
    bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return bars;
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

const handlerImpl: Handler = async (event) => {
  const twelveDataKey = (process.env.VITE_TWELVEDATA_KEY ?? process.env.TWELVEDATA_KEY ?? '').trim();
  const fredKey = (process.env.FRED_API_KEY ?? '').trim();
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  const qs = event.queryStringParameters ?? {};
  // Equity source: Yahoo (deep, no cap, keyless) for the depth backfill; TwelveData
  // (the daily-cron default) otherwise. FRED always supplies the index fields.
  const isYahoo = qs.source === 'yahoo';

  // TwelveData is only needed for the (default) TwelveData equity path — the
  // Yahoo depth backfill needs no TwelveData key at all.
  if (!supabaseUrl || !serviceKey || !fredKey || (!isYahoo && !twelveDataKey)) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / FRED_API_KEY' + (isYahoo ? '' : ' / TWELVEDATA_KEY') }) };
  }

  const isBackfill = qs.backfill === '1';
  const daysRequested = isBackfill ? Math.max(1, parseInt(qs.days ?? '30', 10)) : 1;
  const beforeDate = qs.before; // optional cursor for walking further back across invocations
  // Need enough history for the 504-day percentile window + the days actually being written.
  // TwelveData caps at 5000; FRED has no cap, so on the Yahoo deep backfill the
  // FRED index fields must be pulled deep enough to align with the equity bars
  // being written (else pre-2006 rows would get null VIX/US10Y). +600 covers the
  // 504-day window plus slack ahead of the earliest written day.
  const outputsize = Math.min(5000, 504 + daysRequested + 5);
  const fredLimit = isYahoo ? 504 + daysRequested + 600 : outputsize;

  const runLogBase = { run_type: 'regime-daily' };

  try {
    const [vixBars, vix3mBars, tnxBars] = await Promise.all([
      fredBars(FRED_SERIES.vix, fredKey, fredLimit, beforeDate),
      fredBars(FRED_SERIES.vix3m, fredKey, fredLimit, beforeDate),
      fredBars(FRED_SERIES.us10y, fredKey, fredLimit, beforeDate),
    ]);
    const vix3mAvailable = vix3mBars.length > 0;

    const vixByDate = new Map(vixBars.map((b) => [b.date, b.close]));
    const vix3mByDate = new Map(vix3mBars.map((b) => [b.date, b.close]));
    // DGS10 is already a percent (e.g. 4.25) — no normalization needed.
    const tnxByDate = new Map(tnxBars.map((b) => [b.date, b.close]));

    const rows: Record<string, unknown>[] = [];
    let rowsWritten = 0;

    for (const instrument of TREND_INSTRUMENTS) {
      const bars = isYahoo
        ? await yahooSeries(instrument)
        : await tdSeries(instrument, twelveDataKey, outputsize, beforeDate);
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
          source: isYahoo ? 'yahoo+fred' : 'twelvedata+fred',
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
      summary: `wrote ${rowsWritten} regime_daily rows (${isBackfill ? `backfill days=${daysRequested}` : 'daily'}, source=${isYahoo ? 'yahoo+fred' : 'twelvedata+fred'}, engine ${REGIME_GATE_CONFIG.engine_version})` +
        (vix3mAvailable ? '' : ' — VIX3M unavailable this run; vol_state written as UNKNOWN, never guessed.'),
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

// Daily append runs on the schedule; matches the repo's in-code wrapper pattern
// (macro-snapshot / sector-map-sync), not a netlify.toml `schedule` key. 23:00 UTC
// weekdays — after the equity close AND after macro-snapshot (21:30) /
// sector-map-sync (22:00), so FRED + TwelveData have posted the day's values and
// the three writers don't contend. Backfill mode is NOT reachable this way (see
// header) — it needs the `?backfill=` querystring, which a scheduled cron never sends.
export const handler = schedule('0 23 * * 1-5', handlerImpl);
