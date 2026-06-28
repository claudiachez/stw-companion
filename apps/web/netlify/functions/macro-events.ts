/**
 * Macro Event Risk calendar fetcher (P3).
 *
 * Supplies the raw calendar rows for the Module 3 overlay (CPI, PCE, FOMC,
 * NFP, etc.) — see plans/macro_dashboard_spec.md → Module 3. Classification
 * (overlay state / risk level / surprise) is pure logic in @stw/shared
 * (`classifyEventRisk`) — this function's only job is to return clean rows.
 *
 * Data-source strategy (host-confirmed 2026-06-27):
 *   MVP primary:   MarketWatch U.S. Economic Calendar (HTML scrape — MarketWatch
 *                  has no public calendar API).
 *   MVP secondary: FXStreet Economic Calendar — kept as a MANUAL cross-check
 *                  link in the UI (MacroEventRiskCard), not a second scraper.
 *                  FXStreet's calendar widget is AJAX/JS-driven, so a second
 *                  static-HTML scrape would be at least as fragile as this one
 *                  for no real redundancy benefit; the host's own framing
 *                  ("secondary/manual validation") matches a human-clicks-through
 *                  link better than a second bot.
 *   Production:    a licensed calendar API (Trading Economics / FMP / EODHD) —
 *                  not built yet; this scraper is the interim source.
 *
 * Uses cheerio (not a heavier headless-browser lib) to stay inside Netlify
 * Functions' bundle-size/runtime constraints — same reasoning as the
 * macro-recap Anthropic-SDK-avoidance rule (CLAUDE.md → Conventions).
 *
 * No Supabase/user data is touched here (public calendar read), so this skips
 * JWT verification entirely, unlike macro-recap.ts / ibkr-flex.ts.
 *
 * IMPORTANT — unverified scraper: this sandbox's network policy blocks
 * marketwatch.com, so the selectors below were written defensively (matched
 * by column HEADER TEXT, not brittle class names) without a live look at the
 * page. On any parse failure or zero rows, this returns `source: 'unavailable'`
 * with an empty list and a `warning` — never a fabricated row, and never an
 * uncaught throw. Expect to revisit the selectors after the first real deploy.
 */
import type { Handler } from '@netlify/functions';
import * as cheerio from 'cheerio';

export interface MacroEventRow {
  eventName: string;
  /** ISO datetime, Eastern Time offset (DST-approximated — see easternOffset). */
  releaseTimeEt: string;
  period: string | null;
  actual: string | null;
  consensus: string | null;
  previous: string | null;
  importance: 'low' | 'medium' | 'high' | 'very_high';
  source: string;
  sourceTimestamp: string;
}

const MARKETWATCH_URL = 'https://www.marketwatch.com/economy-politics/calendar';

const VERY_HIGH = [
  /\bcpi\b/i, /\bconsumer price index\b/i, /\bpce\b/i, /\bpersonal consumption expenditures\b/i,
  /\bfomc\b/i, /\bfed(?:eral)? (?:interest rate|funds rate) decision\b/i, /\bpowell\b/i,
  /\bnonfarm payrolls\b/i, /\bunemployment rate\b/i,
];
const HIGH = [/\bppi\b/i, /\bproducer price index\b/i, /\baverage hourly earnings\b/i];
const MEDIUM = [
  /\bjobless claims\b/i, /\bretail sales\b/i, /\bism (?:manufacturing|services)\b/i,
  /\b(?:treasury|bond) auction\b/i, /\b\d+-(?:year|month|week) (?:note|bond|bill) auction\b/i,
];

function classifyImportance(name: string): MacroEventRow['importance'] {
  if (VERY_HIGH.some((re) => re.test(name))) return 'very_high';
  if (HIGH.some((re) => re.test(name))) return 'high';
  if (MEDIUM.some((re) => re.test(name))) return 'medium';
  return 'low';
}

function cleanValue(s: string | undefined): string | null {
  const t = (s ?? '').trim();
  return t === '' || t === '-' || t === '—' ? null : t;
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** EDT (UTC-4) mid-Mar–early-Nov, EST (UTC-5) otherwise — a rough heuristic, good enough for the ±24-48h overlay windows this feeds, not for sub-hour precision. */
function easternOffset(month: number): string {
  return month >= 3 && month <= 10 ? '-04:00' : '-05:00';
}

function combineDateTimeEt(dateText: string | null, timeText: string): string {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();

  if (dateText) {
    const m = dateText.match(/([A-Za-z]+)\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
    if (m) {
      const monthIdx = MONTH_NAMES.findIndex((n) => m[1].toLowerCase().startsWith(n));
      if (monthIdx >= 0) month = monthIdx + 1;
      day = parseInt(m[2], 10);
      if (m[3]) year = parseInt(m[3], 10);
    }
  }

  let hour = 0;
  let minute = 0;
  const tm = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (tm) {
    hour = parseInt(tm[1], 10);
    minute = parseInt(tm[2], 10);
    const ampm = tm[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${easternOffset(month)}`;
}

const DATE_HEADING_RE = /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s*\d{4})?/i;

interface ColIdx {
  time: number;
  report: number;
  period: number;
  actual: number;
  consensus: number;
  previous: number;
}

/**
 * Header-text-matched table walk (resilient to class-name churn): tracks the
 * nearest preceding date heading and the active table's column layout while
 * walking the document in order, then emits one row per <tr> with data cells.
 */
function parseMarketWatch(html: string): MacroEventRow[] {
  const $ = cheerio.load(html);
  const events: MacroEventRow[] = [];
  const nowIso = new Date().toISOString();
  let currentDateText: string | null = null;
  let colIdx: ColIdx | null = null;

  $('body *').each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (!tag) return;
    const $el = $(el);

    if (tag === 'table') {
      const headerCells = $el.find('thead th, thead td').map((__, th) => $(th).text().trim().toLowerCase()).get();
      if (headerCells.length === 0) { colIdx = null; return; }
      const idx: ColIdx = {
        time: headerCells.findIndex((h) => h.includes('time')),
        report: headerCells.findIndex((h) => h.includes('report') || h.includes('event') || h.includes('indicator')),
        period: headerCells.findIndex((h) => h.includes('period')),
        actual: headerCells.findIndex((h) => h.includes('actual')),
        consensus: headerCells.findIndex((h) => h.includes('forecast') || h.includes('consensus') || h.includes('median')),
        previous: headerCells.findIndex((h) => h.includes('previous')),
      };
      colIdx = idx.report >= 0 ? idx : null;
      return;
    }

    if (tag === 'tr' && colIdx) {
      const cells = $el.find('td').map((__, td) => $(td).text().trim()).get();
      if (cells.length === 0) return;
      const eventName = cells[colIdx.report];
      if (!eventName) return;
      const timeText = colIdx.time >= 0 ? cells[colIdx.time] ?? '' : '';
      events.push({
        eventName,
        releaseTimeEt: combineDateTimeEt(currentDateText, timeText),
        period: colIdx.period >= 0 ? cleanValue(cells[colIdx.period]) : null,
        actual: colIdx.actual >= 0 ? cleanValue(cells[colIdx.actual]) : null,
        consensus: colIdx.consensus >= 0 ? cleanValue(cells[colIdx.consensus]) : null,
        previous: colIdx.previous >= 0 ? cleanValue(cells[colIdx.previous]) : null,
        importance: classifyImportance(eventName),
        source: 'MarketWatch',
        sourceTimestamp: nowIso,
      });
      return;
    }

    // Own text only (not descendants) — avoids matching huge wrapper containers.
    const ownText = $el.clone().children().remove().end().text().trim();
    if (ownText && ownText.length < 60 && DATE_HEADING_RE.test(ownText)) {
      currentDateText = ownText;
    }
  });

  return events;
}

async function fetchCalendarHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const html = await fetchCalendarHtml(MARKETWATCH_URL);
    const events = parseMarketWatch(html);
    if (events.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [], source: 'unavailable', warning: 'No calendar rows parsed from MarketWatch.' }),
      };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, source: 'MarketWatch' }),
    };
  } catch (e) {
    console.error('macro-events: MarketWatch fetch/parse failed —', e);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [],
        source: 'unavailable',
        warning: `Event calendar temporarily unavailable: ${e instanceof Error ? e.message : 'unknown error'}`,
      }),
    };
  }
};
