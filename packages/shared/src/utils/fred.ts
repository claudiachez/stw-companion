// FRED (Federal Reserve Economic Data) — series ids + pure URL/parse helpers.
//
// FRED is the free, authoritative source for the macro *index* indicators that
// TwelveData's free tier throttled (VIX, VIX3M, US10Y, HY credit spread, dollar).
// It is server-only (no CORS), so the browser reaches it through the `fred`
// Netlify proxy; the scheduled writers call it directly. This module holds only
// framework-agnostic bits (ids, URL builder, response parser) so both sides —
// and their unit tests — share exactly one implementation.
// See plans/20260707_data_feeds_inventory_and_plan.md.

/** Friendly key → FRED series id. */
export const FRED_SERIES = {
  vix: 'VIXCLS',           // CBOE Volatility Index (VIX) daily close
  vix3m: 'VXVCLS',         // CBOE S&P 500 3-Month Volatility Index (VIX3M)
  us10y: 'DGS10',          // 10-Year Treasury Constant Maturity Rate (yield %, already in %)
  hyOas: 'BAMLH0A0HYM2',   // ICE BofA US High Yield Option-Adjusted Spread (%)
  dollar: 'DTWEXBGS',      // Nominal Broad U.S. Dollar Index (daily)
} as const;

export type FredSeriesId = (typeof FRED_SERIES)[keyof typeof FRED_SERIES];

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

/**
 * Build a FRED observations URL for the most-recent `limit` daily points
 * (newest-first — parseFredObservations reverses to ascending). Using
 * sort_order=desc + limit avoids any client-side date arithmetic. Pass
 * `observationEnd` (YYYY-MM-DD) to end the window at a past date — the cursor
 * regime-daily's backfill walks back with.
 */
export function buildFredUrl(seriesId: string, apiKey: string, limit = 400, observationEnd?: string): string {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: String(limit),
  });
  if (observationEnd) params.set('observation_end', observationEnd);
  return `${FRED_BASE}?${params.toString()}`;
}

export interface FredBar {
  date: string;   // YYYY-MM-DD
  close: number;
}

interface FredJson {
  observations?: { date: string; value: string }[];
}

/**
 * Parse a FRED observations response into ascending {date, close} bars. FRED
 * encodes a missing value as "." (non-trading day / not-yet-released) — those
 * rows are dropped. Input may be newest-first (our buildFredUrl uses desc); the
 * result is always oldest→newest so callers can treat it like a close series.
 */
export function parseFredObservations(json: unknown): FredBar[] {
  const obs = (json as FredJson)?.observations;
  if (!Array.isArray(obs)) return [];
  const bars: FredBar[] = [];
  for (const o of obs) {
    if (!o || o.value === '.' || o.value == null) continue;
    const close = parseFloat(o.value);
    if (Number.isNaN(close)) continue;
    bars.push({ date: o.date, close });
  }
  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return bars;
}
