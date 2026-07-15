/**
 * Macro Event Risk calendar (P3) — sourced from FRED, not a scrape.
 *
 * Supplies the raw calendar rows for the Module 3 overlay. Classification (overlay
 * state / risk level / surprise) is pure logic in @stw/shared (`classifyEventRisk`);
 * this function only returns clean rows, sorted soonest-first.
 *
 * Sources:
 *   - FRED `/fred/release/dates` per target release — the authoritative U.S.
 *     econ-release schedule. Query each by release_id (verified live against
 *     /fred/releases) with include_release_dates_with_no_data so future scheduled
 *     dates appear, then window-filter. FRED gives a DATE only, so each release is
 *     stamped with its conventional ET release time.
 *   - FRED `/fred/series/observations` (latest TWO values) per release → the print
 *     numbers. The release *calendar* has no values; the *series* does. For an
 *     UPCOMING event the latest value is its **Previous**; for a just-RELEASED event
 *     the latest value is its **Actual** and the one before it the Previous (the
 *     series carries the new figure within minutes of the 8:30 drop). Both fetches
 *     for a release happen in the same paced worker (a single concurrent FRED round).
 *   - FOMC rate decisions are Fed meetings, not a FRED release → a small static list
 *     (see FOMC_DECISION_DATES; VERIFY against the Fed's published schedule).
 *
 * What FRED still can't give: **consensus** (a proprietary survey of economists). So
 * `consensus` stays null — classifyEventRisk's surprise/"shock" path just doesn't fire;
 * the reaction overlay fires on the release TIME (not on consensus) and shows the actual.
 * (Note: FRED's calendar lists UMich Consumer Sentiment's FINAL date, not the
 * mid-month preliminary — its scheduled date can read later than a trader expects.)
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
  lowerIsBetter?: boolean;
  importance: 'low' | 'medium' | 'high' | 'very_high';
  source: string;
  sourceTimestamp: string;
}

type Importance = MacroEventRow['importance'];
type PrevFmt = 'pct' | 'thousandsChg' | 'levelK' | 'index';

/** How to fetch + render a release's latest print for the "Previous" column.
 *  `units` is a FRED observation transform (pc1 = YoY %, pch = MoM %, chg = period
 *  change, lin = as-reported). `label` is a short qualifier so the figure reads
 *  unambiguously (e.g. "4.2% YoY"). */
interface PrevSpec { series: string; units: string; fmt: PrevFmt; label?: string }

// Releases we surface, by FRED release_id (verified live against /fred/releases),
// each with its conventional ET release time and the series for its Previous print.
// `lowerIsBetter` encodes each metric's market read for the favorability arrow: inflation
// prints (CPI/PPI/PCE) are bullish when they FALL; growth/activity/jobs/sentiment when they RISE.
const TARGET_RELEASES: { id: number; name: string; importance: Importance; timeEt: string; lowerIsBetter: boolean; prev: PrevSpec }[] = [
  { id: 10, name: 'Consumer Price Index (CPI)',      importance: 'very_high', timeEt: '08:30', lowerIsBetter: true,  prev: { series: 'CPIAUCSL',            units: 'pc1', fmt: 'pct',          label: 'YoY' } },
  { id: 46, name: 'Producer Price Index (PPI)',      importance: 'high',      timeEt: '08:30', lowerIsBetter: true,  prev: { series: 'PPIFIS',              units: 'pc1', fmt: 'pct',          label: 'YoY' } },
  { id: 54, name: 'Personal Income & Outlays (PCE)', importance: 'very_high', timeEt: '08:30', lowerIsBetter: true,  prev: { series: 'PCEPI',               units: 'pc1', fmt: 'pct',          label: 'YoY' } },
  { id: 50, name: 'Employment Situation (NFP)',      importance: 'very_high', timeEt: '08:30', lowerIsBetter: false, prev: { series: 'PAYEMS',              units: 'chg', fmt: 'thousandsChg', label: 'MoM' } },
  { id: 53, name: 'Gross Domestic Product (GDP)',    importance: 'high',      timeEt: '08:30', lowerIsBetter: false, prev: { series: 'A191RL1Q225SBEA',     units: 'lin', fmt: 'pct',          label: 'QoQ ann.' } },
  { id: 9,  name: 'Retail Sales',                    importance: 'high',      timeEt: '08:30', lowerIsBetter: false, prev: { series: 'RSAFS',               units: 'pch', fmt: 'pct',          label: 'MoM' } },
  { id: 351, name: 'Philadelphia Fed Manufacturing', importance: 'medium',    timeEt: '08:30', lowerIsBetter: false, prev: { series: 'GACDFSA066MSFRBPHI',  units: 'lin', fmt: 'index' } },
  { id: 27, name: 'Housing Starts & Building Permits', importance: 'medium',  timeEt: '08:30', lowerIsBetter: false, prev: { series: 'HOUST',               units: 'lin', fmt: 'levelK',       label: 'starts, SAAR' } },
  { id: 91, name: 'Consumer Sentiment (UMich)',      importance: 'medium',    timeEt: '10:00', lowerIsBetter: false, prev: { series: 'UMCSENT',             units: 'lin', fmt: 'index' } },
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

/** Render a raw FRED observation value into the compact "Previous" string. */
function fmtPrev(v: number, spec: PrevSpec): string {
  let body: string;
  switch (spec.fmt) {
    case 'pct':          body = `${v.toFixed(1)}%`; break;
    case 'thousandsChg': body = `${v >= 0 ? '+' : ''}${Math.round(v).toLocaleString('en-US')}K`; break;
    case 'levelK':       body = `${Math.round(v).toLocaleString('en-US')}K`; break;
    case 'index':        body = v.toFixed(1); break;
  }
  return spec.label ? `${body} ${spec.label}` : body;
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

/**
 * The latest two observations for a series, formatted. `latest` is the most recent
 * released print; `prior` the one before it. An UPCOMING event shows `latest` as its
 * Previous; a just-RELEASED event shows `latest` as its Actual and `prior` as Previous
 * (the FRED data series carries the new number within minutes of the 8:30 release —
 * calendar dates alone never do).
 */
async function latestPrints(spec: PrevSpec, key: string): Promise<{ latest: string | null; prior: string | null }> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${spec.series}&api_key=${key}`
    + `&file_type=json&units=${spec.units}&sort_order=desc&limit=2`;
  const res = await fetch(url);
  if (!res.ok) return { latest: null, prior: null };
  const d = await res.json() as { observations?: { value: string }[] };
  const fmt = (raw: string | undefined): string | null => {
    if (raw == null || raw === '' || raw === '.') return null;
    const v = Number(raw);
    return Number.isFinite(v) ? fmtPrev(v, spec) : null;
  };
  return { latest: fmt(d.observations?.[0]?.value), prior: fmt(d.observations?.[1]?.value) };
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

    // One paced FRED round: each release worker fetches both its scheduled dates and
    // its latest two prints, concurrently within the chunk.
    const perRelease = await runPaced(
      TARGET_RELEASES,
      async (t) => {
        const [dates, prints] = await Promise.all([releaseDates(t.id, fredKey), latestPrints(t.prev, fredKey)]);
        return { t, dates, prints };
      },
      FEED_LIMITS.fred,
    );
    for (const { t, dates, prints } of perRelease) {
      for (const date of dates) {
        if (!inWindow(date, now)) continue;
        const releaseTimeEt = isoEt(date, t.timeEt);
        // A row whose release time has passed is RELEASED → its latest print is the
        // Actual, the one before it the Previous. A still-upcoming row shows the last
        // released value as its Previous (Actual pending). This is what lets a just-
        // released CPI show its number instead of vanishing from the card.
        const released = new Date(releaseTimeEt).getTime() <= now.getTime();
        events.push({
          eventName: t.name,
          releaseTimeEt,
          period: null,
          actual: released ? prints.latest : null,
          consensus: null,
          previous: released ? prints.prior : prints.latest,
          lowerIsBetter: t.lowerIsBetter,
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
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' },
      body: JSON.stringify({ events, source: 'FRED' }),
    };
  } catch (e) {
    console.error('macro-events: FRED fetch/parse failed —', e);
    return unavailable(`Event calendar temporarily unavailable: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
};
