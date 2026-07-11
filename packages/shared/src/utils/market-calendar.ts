// US equity-market (NYSE) trading calendar — weekend + full-day holiday check.
//
// Used to keep the Macro regime trajectory (and any other "last N trading days"
// view) on ACTUAL market days: no weekends, no holidays. The macro-snapshot cron
// fires Mon–Fri regardless of holidays, so a holiday weekday can leave a snapshot
// row that isn't a trading day — this filters those out on read.
//
// Hardcoded, extend annually (same maintenance model as the FOMC date list in
// macro-events). Dates are the OBSERVED market closures, so weekend-shifted
// holidays (e.g. Jul 4 falling on a Saturday → observed the preceding Friday)
// are already resolved to the day the market is actually shut.

export const US_MARKET_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);

/**
 * True when `dateStr` (a 'YYYY-MM-DD' ET calendar day) is a US equity trading
 * day — a weekday that isn't a NYSE holiday. Parsed date-only (no timezone
 * component) so there's no UTC/ET drift on the weekday computation.
 */
export function isTradingDay(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sun … 6 = Sat
  if (dow === 0 || dow === 6) return false;
  return !US_MARKET_HOLIDAYS.has(dateStr);
}
