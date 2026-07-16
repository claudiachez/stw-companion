/**
 * A scheduled (or just-reported) quarterly earnings release for one ticker.
 * Sourced from Finnhub's `/calendar/earnings` — the free-tier key already in use
 * for live quotes serves it. Unlike the macro release calendar, earnings DO carry
 * a real consensus (`epsEstimate` / `revenueEstimate`).
 */
export interface EarningsEvent {
  symbol: string;
  /** Report date, YYYY-MM-DD (ET). */
  date: string;
  /** Session: before market open, after market close, during market hours, or unknown. */
  hour: 'bmo' | 'amc' | 'dmh' | null;
  quarter: number | null;
  year: number | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}
