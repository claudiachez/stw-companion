/**
 * Macro Event Risk calendar (P3) — now sourced from FRED, not the MarketWatch scrape.
 *
 * Supplies the raw calendar rows for the Module 3 overlay (CPI, PCE, NFP, GDP,
 * FOMC). Classification (overlay state / risk level / surprise) is pure logic in
 * @stw/shared (`classifyEventRisk`); this function only returns clean rows.
 *
 * Source (rebuilt 2026-07-08, retiring the fragile MarketWatch HTML scrape):
 *   - FRED `/fred/release/dates` per target release — authoritative U.S. econ-release
 *     schedule. Query each by release_id (verified live against /fred/releases:
 *     CPI 10, Personal Income & Outlays/PCE 54, Employment Situation/NFP 50, GDP 53,
 *     PPI 46) with include_release_dates_with_no_data so future scheduled dates
 *     appear, then window-filter client-side. (The all-releases feed can't be used:
 *     sort_order=desc surfaces the furthest-future dates first, so the near-term
 *     ones fall outside any small limit — confirmed empirically.) FRED gives a DATE
 *     only, so each release is stamped with its conventional ET release time.
 *   - FOMC rate decisions are Fed meetings, not a FRED release → a small static list
 *     (see FOMC_DECISION_DATES; VERIFY against the Fed's published schedule).
 *
 * What FRED can't give (vs the old scrape): actual/consensus/previous print values.
 * classifyEventRisk degrades cleanly — the post-release surprise/"shock" path just
 * doesn't fire (it needs actual+consensus); the upcoming-event windows (event_watch
 * / high_event_risk), which only need the release time + importance, work fully.
 *
 * On any failure or zero rows this returns `source: 'unavailable'` with an empty
 * list + a `warning` — never a fabricated row, never an uncaught throw. Direct
 * REST fetch only; FRED_API_KEY is read server-side (no VITE_ prefix).
 */
import type { Handler } from '@netlify/functions';
import { runPaced, FEED_LIMITS } from '@stw/shared';

export interface MacroEventRow {
  eventName: string;
  releaseTimeEt: string;
  period: string | null;
  actual: string | null;
  consensus: string | null;
  previous: string | null;
  importance: 'low' | 'medium' | 'high' | 'very_high';
  source: string;
  sourceTimestamp: string;
}

type Importance = MacroEventRow['importance'];

// Releases we surface, by FRED release_id (verified live against /fred/releases),
// with each one's conventional ET release time (FRED provides a date only).
const TARGET_RELEASES: { id: number; name: string; importance: Importance; timeEt: string }[] = [
  { id: 10, name: 'Consumer Price Index (CPI)', importance: 'very_high', timeEt: '08:30' },
  { id: 54, name: 'Personal Income & Outlays (PCE)', importance: 'very_high', timeEt: '08:30' },
  { id: 50, name: 'Employment Situation (NFP)', importance: 'very_high', timeEt: '08:30' },
  { id: 53, name: 'Gross Domestic Product (GDP)', importance: 'high', timeEt: '08:30' },
  { id: 46, name: 'Producer Price Index (PPI)', importance: 'high', timeEt: '08:30' },
];

// FOMC rate decisions — announced day 2 of each meeting at 2:00pm ET. NOT a FRED
// release, so hardcoded. ⚠ Best-effort 2026 schedule — VERIFY against
// federalreserve.gov/monetarypolicy/fomccalendars.htm and extend each year.
const FOMC_DECISION_DATES = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
];

const WINDOW_PAST_DAYS = 2;
const WINDOW_FUTURE_DAYS = 45;

/** EDT (UTC-4) mid-Mar–early-Nov, EST (UTC-5) otherwise — good enough for the ±24-48h overlay windows. */
function easternOffset(month: number): string {
  return month >= 3 && month <= 10 ? '-04:00' : '-05:00';
}

/** date = YYYY-MM-DD, timeEt = HH:MM → ISO datetime with an ET offset. */
function isoEt(date: string, timeEt: string): string {
  const month = parseInt(date.slice(5, 7), 10);
  return `${date}T${timeEt}:00${easternOffset(month)}`;
}

function inWindow(date: string, now: Date): boolean {
  const d = new Date(`${date}T12:00:00Z`).getTime();
  const lo = now.getTime() - WINDOW_PAST_DAYS * 86_400_000;
  const hi = now.getTime() + WINDOW_FUTURE_DAYS * 86_400_000;
  return d >= lo && d <= hi;
}

interface FredReleaseDate { date: string }

/** Scheduled dates for one FRED release (most recent ~2yrs; desc, includes future). */
async function releaseDates(id: number, key: string): Promise<string[]> {
  const url = `https://api.stlouisfed.org/fred/release/dates?release_id=${id}&api_key=${key}`
    + '&file_type=json&include_release_dates_with_no_data=true&sort_order=desc&limit=24';
  const res = await fetch(url);
  if (!res.ok) return [];
  const d = await res.json() as { release_dates?: FredReleaseDate[] };
  return (d.release_dates ?? []).map((r) => r.date).filter(Boolean);
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const fredKey = (process.env.FRED_API_KEY ?? '').trim();
  const nowIso = new Date().toISOString();
  const now = new Date();

  const unavailable = (warning: string) => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [], source: 'unavailable', warning }),
  });

  if (!fredKey) return unavailable('FRED_API_KEY not configured.');

  try {
    const events: MacroEventRow[] = [];

    // One FRED call per target release (5), paced through the shared limiter.
    const perRelease = await runPaced(
      TARGET_RELEASES,
      async (t) => ({ t, dates: await releaseDates(t.id, fredKey) }),
      FEED_LIMITS.fred,
    );
    for (const { t, dates } of perRelease) {
      for (const date of dates) {
        if (!inWindow(date, now)) continue;
        events.push({
          eventName: t.name,
          releaseTimeEt: isoEt(date, t.timeEt),
          period: null,
          actual: null, consensus: null, previous: null,
          importance: t.importance,
          source: 'FRED',
          sourceTimestamp: nowIso,
        });
      }
    }

    for (const date of FOMC_DECISION_DATES) {
      if (!inWindow(date, now)) continue;
      events.push({
        eventName: 'FOMC Rate Decision',
        releaseTimeEt: isoEt(date, '14:00'),
        period: null,
        actual: null, consensus: null, previous: null,
        importance: 'very_high',
        source: 'Fed schedule',
        sourceTimestamp: nowIso,
      });
    }

    if (events.length === 0) {
      return unavailable('No target releases in the current window.');
    }

    events.sort((a, b) => (a.releaseTimeEt < b.releaseTimeEt ? -1 : a.releaseTimeEt > b.releaseTimeEt ? 1 : 0));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({ events, source: 'FRED' }),
    };
  } catch (e) {
    console.error('macro-events: FRED fetch/parse failed —', e);
    return unavailable(`Event calendar temporarily unavailable: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
};
