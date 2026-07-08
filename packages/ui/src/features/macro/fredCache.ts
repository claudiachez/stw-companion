// Client-side FRED cache — the browser twin of maCache.ts, but for the macro
// INDEX series (VIX, VIX3M, US10Y, HY OAS, dollar) that now come from FRED via
// the same-origin `fred` Netlify proxy (FRED is server-only — no CORS, key stays
// server-side). Daily closes are cached in localStorage under `fred-{series}`,
// refreshed once per day, exactly like maCache's `macro-ma-{symbol}` store.
// See plans/20260707_data_feeds_inventory_and_plan.md.

const FRED_PREFIX = 'fred-';
const FRED_TTL = 24 * 60 * 60 * 1000;

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

interface FredCacheEntry { closes: number[]; lastDate: string | null; date: string; ts: number }

export function loadFredCloses(series: string): number[] {
  try {
    const raw = localStorage.getItem(FRED_PREFIX + series);
    if (!raw) return [];
    return (JSON.parse(raw) as FredCacheEntry).closes ?? [];
  } catch { return []; }
}

/** The datetime of the most recent daily bar for a series (how fresh the close is). */
export function loadFredLastDate(series: string): string | null {
  try {
    const raw = localStorage.getItem(FRED_PREFIX + series);
    if (!raw) return null;
    return (JSON.parse(raw) as FredCacheEntry).lastDate ?? null;
  } catch { return null; }
}

function fredFresh(series: string): boolean {
  try {
    const raw = localStorage.getItem(FRED_PREFIX + series);
    if (!raw) return false;
    const d = JSON.parse(raw) as FredCacheEntry;
    return d.date === todayStr() || (d.ts ?? 0) + FRED_TTL > Date.now();
  } catch { return false; }
}

function saveFred(series: string, closes: number[], lastDate: string | null) {
  try { localStorage.setItem(FRED_PREFIX + series, JSON.stringify({ closes, lastDate, date: todayStr(), ts: Date.now() })); }
  catch { /* ignore quota */ }
}

/**
 * Daily closes (oldest → newest) for one or more FRED series, cached for the day.
 * Already-fresh series are served from localStorage; the rest are fetched in ONE
 * proxy call. A series the proxy can't return falls back to whatever's cached
 * (possibly empty → the module degrades that cell to "—").
 */
export async function fredBatch(series: string[]): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  const need = series.filter((s) => {
    const cached = loadFredCloses(s);
    if (cached.length > 0 && fredFresh(s)) { result[s] = cached; return false; }
    return true;
  });
  if (need.length === 0) return result;

  try {
    const res = await fetch(`/.netlify/functions/fred?series=${encodeURIComponent(need.join(','))}`);
    if (res.ok) {
      const data = await res.json() as Record<string, { closes: number[]; lastDate: string | null }>;
      for (const s of need) {
        const d = data[s];
        if (d && Array.isArray(d.closes) && d.closes.length) { saveFred(s, d.closes, d.lastDate); result[s] = d.closes; }
        else result[s] = loadFredCloses(s);
      }
    } else {
      for (const s of need) result[s] = loadFredCloses(s);
    }
  } catch {
    for (const s of need) result[s] = loadFredCloses(s);
  }
  return result;
}

/** Convenience single-series wrapper over fredBatch. */
export async function fredCloses(series: string): Promise<number[]> {
  return (await fredBatch([series]))[series] ?? [];
}
