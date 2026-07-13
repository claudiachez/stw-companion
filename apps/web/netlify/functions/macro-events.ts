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
 *   - FRED `/fred/series/observations` (latest value) per release → the **Previous**
 *     print (the last released figure, e.g. CPI YoY %). The release *calendar* has
 *     no values; the *series* does. Both fetches for a release happen in the same
 *     paced worker, so it stays a single concurrent FRED round.
 *   - FOMC rate decisions are Fed meetings, not a FRED release → a small static list
 *     (see FOMC_DECISION_DATES; VERIFY against the Fed's published schedule).
 *
 * What FRED still can't give: **consensus** (a proprietary survey of economists) and
 * **actual** on a schedule. So `consensus`/`actual` stay null — classifyEventRisk's
 * surprise/"shock" path just doesn't fire; the upcoming-event windows work fully.
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
const TARGET_RELEASES: { id: number; name: string; importance: Importance; timeEt: string; prev: PrevSpec }[] = [
  { id: 10, name: 'Consumer Price Index (CPI)',      importance: 'very_high', timeEt: '08:30', prev: { series: 'CPIAUCSL',            units: 'pc1', fmt: 'pct',          label: 'YoY' } },
  { id: 46, name: 'Producer Price Index (PPI)',      importance: 'high',      timeEt: '08:30', prev: { series: 'PPIFIS',              units: 'pc1', fmt: 'pct',          label: 'YoY' } },
  { id: 54, name: 'Personal Income & Outlays (PCE)', importance: 'very_high', timeEt: '08:30', prev: { series: 'PCEPI',               units: 'pc1', fmt: 'pct',          label: 'YoY' } },
  { id: 50, name: 'Employment Situation (NFP)',      importance: 'very_high', timeEt: '08:30', prev: { series: 'PAYEMS',              units: 'chg', fmt: 'thousandsChg', label: 'MoM' } },
  { id: 53, name: 'Gross Domestic Product (GDP)',    importance: 'high',      timeEt: '08:30', prev: { series: 'A191RL1Q225SBEA',     units: 'lin', fmt: 'pct',          label: 'QoQ ann.' } },
  { id: 9,  name: 'Retail Sales',                    importance: 'high',      timeEt: '08:30', prev: { series: 'RSAFS',               units: 'pch', fmt: 'pct',          label: 'MoM' } },
  { id: 351, name: 'Philadelphia Fed Manufacturing', importance: 'medium',    timeEt: '08:30', prev: { series: 'GACDFSA066MSFRBPHI',  units: 'lin', fmt: 'index' } },
  { id: 27, name: 'Housing Starts & Building Permits', importance: 'medium',  timeEt: '08:30', prev: { series: 'HOUST',               units: 'lin', fmt: 'levelK',       label: 'starts, SAAR' } },
  { id: 91, name: 'Consumer Sentiment (UMich)',      importance: 'medium',    timeEt: '10:00', prev: { series: 'UMCSENT',             units: 'lin', fmt: 'index' } },
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

/** Latest observation for a series (the last released print), formatted for display. */
async function previousPrint(spec: PrevSpec, key: string): Promise<string | null> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${spec.series}&api_key=${key}`
    + `&file_type=json&units=${spec.units}&sort_order=desc&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const d = await res.json() as { observations?: { value: string }[] };
  const raw = d.observations?.[0]?.value;
  if (raw == null || raw === '' || raw === '.') return null;
  const v = Number(raw);
  return Number.isFinite(v) ? fmtPrev(v, spec) : null;
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
    // its latest print (the Previous value), concurrently within the chunk.
    const perRelease = await runPaced(
      TARGET_RELEASES,
      async (t) => {
        const [dates, previous] = await Promise.all([releaseDates(t.id, fredKey), previousPrint(t.prev, fredKey)]);
        return { t, dates, previous };
      },
      FEED_LIMITS.fred,
    );
    for (const { t, dates, previous } of perRelease) {
      for (const date of dates) {
        if (!inWindow(date, now)) continue;
        events.push({
          eventName: t.name,
          releaseTimeEt: isoEt(date, t.timeEt),
          period: null,
          actual: null, consensus: null, previous,
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
