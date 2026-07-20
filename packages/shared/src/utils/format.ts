export function formatPct(value: number, decimals = 1): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

/** Month + full year, e.g. "Mar 2026" — for "member since"-style date-only labels. */
export function formatMonthYear(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function formatWeight(w: number | null): string {
  if (w == null) return '–';
  return `${w.toFixed(1)}%`;
}

const ET_TZ = { timeZone: 'America/New_York' };

// Canonical timestamp format used across all surfaces: "Jun 4 · 7:46 PM ET"
export function fmtDateTime(val: Date | string | null): string {
  if (!val) return '—';
  const d = val instanceof Date ? val : new Date(val);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...ET_TZ });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...ET_TZ });
  return `${date} · ${time} ET`;
}

/**
 * Canonical trading-date derivation: the calendar date (YYYY-MM-DD) a
 * `leg_transactions.executed_at` timestamp should be attributed to for any
 * date-based grouping/reconciliation (repo convention, plans/integrity-guardrails.md
 * Item 1.7). Casting a UTC timestamp straight to a date mis-assigns evening-ET
 * events to the next day — so real intraday timestamps are localized to ET first.
 *
 * Exact-midnight-UTC timestamps are a special case: they are placeholder
 * date-only entries (no time-of-day was ever captured), and the UTC calendar
 * date IS the already-confirmed-correct ET date. Localizing those via
 * `America/New_York` would roll them back to the previous day (ET is always
 * behind UTC) and silently corrupt an otherwise-correct date — so this function
 * reads the date directly for that case instead of converting it.
 */
export function tradingDateET(val: Date | string): string {
  const d = val instanceof Date ? val : new Date(val);
  const isMidnightUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (isMidnightUtc) return d.toISOString().slice(0, 10);
  return d.toLocaleDateString('en-CA', ET_TZ);
}
