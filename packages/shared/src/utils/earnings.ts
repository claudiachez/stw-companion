import type { EarningsEvent } from '../types/earnings';

/**
 * Mega-cap "market movers" whose earnings move the whole index, tracked on the
 * Macro Event Risk calendar even when STW doesn't hold them. Kept small and
 * explicit — the point is index-level volatility, not a broad watchlist.
 */
export const MARKET_MOVERS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'] as const;

/** ET calendar date (YYYY-MM-DD) for a ms epoch. */
function etDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * The soonest not-yet-passed earnings for a symbol from a list of events.
 * "Upcoming" = report date on or after today (ET). Returns null if none ahead.
 */
export function nextUpcomingEarnings(events: EarningsEvent[], nowMs: number = Date.now()): EarningsEvent | null {
  const today = etDay(nowMs);
  const ahead = events
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return ahead[0] ?? null;
}

/** Whole days from today (ET) to a YYYY-MM-DD date. 0 = today, 1 = tomorrow. */
export function daysUntil(dateStr: string, nowMs: number = Date.now()): number {
  const today = etDay(nowMs);
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/** "today" / "tomorrow" / "in 3 days" / "in 2 weeks" — a compact proximity label. */
export function earningsProximity(dateStr: string, nowMs: number = Date.now()): string {
  const d = daysUntil(dateStr, nowMs);
  if (Number.isNaN(d)) return '';
  if (d < 0) return 'reported';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 14) return `in ${d} days`;
  return `in ${Math.round(d / 7)} weeks`;
}

/** Session label for the report time. */
export function earningsHourLabel(hour: EarningsEvent['hour']): string {
  switch (hour) {
    case 'bmo': return 'before open';
    case 'amc': return 'after close';
    case 'dmh': return 'during session';
    default:    return '';
  }
}

/** Compact EPS estimate, e.g. "est. EPS 0.48" / "est. EPS −0.12"; null → "". */
export function fmtEpsEstimate(eps: number | null): string {
  if (eps == null || !Number.isFinite(eps)) return '';
  const sign = eps < 0 ? '−' : '';
  return `est. EPS ${sign}${Math.abs(eps).toFixed(2)}`;
}
