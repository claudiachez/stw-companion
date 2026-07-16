// Computed NYSE holiday calendar — the authoritative SOURCE the
// market-calendar-sync scheduled function upserts into `market_holidays`, so the
// shared trading calendar (migration 068) auto-extends forever with no hardcoded
// per-year list and no external feed.
//
// nyseHolidays(year) derives closures from the fixed rules: nth-weekday holidays,
// Good Friday (via the Easter algorithm), and the NYSE weekend-observance shifts.
// Validated against the known 2025–2027 dates in nyse-calendar.test.ts, so unseen
// future years are trusted.
//
// Observance: a holiday on Saturday is observed the preceding Friday; on Sunday,
// the following Monday. New Year's Day is the one exception — when Jan 1 is a
// Saturday the NYSE does NOT close the preceding Dec 31, so there's no closure.
//
// (This is the generator. The client-side `isTradingDay` mirror lives in
// market-calendar.ts; the DB `market_holidays` table + is_trading_day RPC are the
// runtime source of truth this feeds.)

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** nth (1-based) `weekday` (0=Sun…6=Sat) of `month0` (0-based) in `year`. */
function nthWeekday(year: number, month0: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month0, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month0, 1 + offset + (n - 1) * 7));
}

/** Last `weekday` of `month0` in `year`. */
function lastWeekday(year: number, month0: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month0 + 1, 0));
  const back = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month0 + 1, 0 - back));
}

/** Easter Sunday (Anonymous Gregorian algorithm). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Shift a Saturday holiday back to Friday, a Sunday holiday forward to Monday. */
function observed(d: Date): Date {
  const dow = d.getUTCDay();
  if (dow === 6) return new Date(d.getTime() - 86_400_000);
  if (dow === 0) return new Date(d.getTime() + 86_400_000);
  return d;
}

export interface NyseHoliday { date: string; name: string }

/** The NYSE full-day closures for `year`, as observed dates, ascending. */
export function nyseHolidays(year: number): NyseHoliday[] {
  const out: NyseHoliday[] = [];

  // New Year's Day — observance exception: Sat → no closure (no Dec 31 close),
  // Sun → following Monday, else Jan 1.
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const jan1Dow = jan1.getUTCDay();
  if (jan1Dow === 0) out.push({ date: ymd(new Date(Date.UTC(year, 0, 2))), name: "New Year's Day (observed)" });
  else if (jan1Dow !== 6) out.push({ date: ymd(jan1), name: "New Year's Day" });

  out.push({ date: ymd(nthWeekday(year, 0, 1, 3)), name: 'Martin Luther King Jr. Day' }); // 3rd Mon Jan
  out.push({ date: ymd(nthWeekday(year, 1, 1, 3)), name: "Presidents' Day" });            // 3rd Mon Feb
  out.push({ date: ymd(new Date(easterSunday(year).getTime() - 2 * 86_400_000)), name: 'Good Friday' });
  out.push({ date: ymd(lastWeekday(year, 4, 1)), name: 'Memorial Day' });                 // last Mon May

  // The three fixed-date holidays that can shift for observance.
  const shifting: [number, number, string][] = [[5, 19, 'Juneteenth'], [6, 4, 'Independence Day'], [11, 25, 'Christmas Day']];
  for (const [month0, day, name] of shifting) {
    const nominal = new Date(Date.UTC(year, month0, day));
    const obs = observed(nominal);
    out.push({ date: ymd(obs), name: obs.getTime() === nominal.getTime() ? name : `${name} (observed)` });
  }

  out.push({ date: ymd(nthWeekday(year, 8, 1, 1)), name: 'Labor Day' });         // 1st Mon Sep
  out.push({ date: ymd(nthWeekday(year, 10, 4, 4)), name: 'Thanksgiving Day' }); // 4th Thu Nov

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
