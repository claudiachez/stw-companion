// Shared TwelveData daily-close cache + Finnhub quote helpers for the macro
// modules. Daily closes are cached in localStorage under `macro-ma-{symbol}`
// (same store the trend hook writes), refreshed once per day.

const MA_PREFIX = 'macro-ma-';
const MA_TTL = 24 * 60 * 60 * 1000;

function todayStr() { return new Date().toISOString().slice(0, 10); }

export function loadCloses(symbol: string): number[] {
  try {
    const raw = localStorage.getItem(MA_PREFIX + symbol);
    if (!raw) return [];
    return (JSON.parse(raw) as { closes: number[] }).closes ?? [];
  } catch { return []; }
}

function saveCloses(symbol: string, closes: number[], lastDate?: string | null) {
  try { localStorage.setItem(MA_PREFIX + symbol, JSON.stringify({ closes, date: todayStr(), ts: Date.now(), lastDate: lastDate ?? null })); }
  catch { /* ignore */ }
}

/** The datetime of the most recent daily bar for a symbol (how fresh the close is). */
export function loadLastDate(symbol: string): string | null {
  try {
    const raw = localStorage.getItem(MA_PREFIX + symbol);
    if (!raw) return null;
    return (JSON.parse(raw) as { lastDate?: string | null }).lastDate ?? null;
  } catch { return null; }
}

export function cacheFresh(symbol: string): boolean {
  try {
    const raw = localStorage.getItem(MA_PREFIX + symbol);
    if (!raw) return false;
    const d = JSON.parse(raw) as { date?: string; ts?: number };
    return d.date === todayStr() || (d.ts ?? 0) + MA_TTL > Date.now();
  } catch { return false; }
}

export async function finnhubQuote(fhSym: string, key: string): Promise<number | null> {
  try {
    const d = await (await fetch(`https://finnhub.io/api/v1/quote?symbol=${fhSym}&token=${key}`)).json();
    return d.c || null;
  } catch { return null; }
}

/** Daily closes (oldest → newest) from TwelveData, cached for the day. */
export async function tdDailyCloses(tdSym: string, key: string, outputsize = 252): Promise<number[]> {
  const cached = loadCloses(tdSym);
  if (cached.length > 0 && cacheFresh(tdSym)) return cached;
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${tdSym}&interval=1day&outputsize=${outputsize}&timezone=UTC&apikey=${key}`;
    const d = await (await fetch(url)).json();
    if (d.status === 'ok' && d.values?.length) {
      const lastDate = (d.values[0] as Record<string, string>)?.datetime ?? null; // values are newest-first
      const closes = [...d.values].reverse().map((v: Record<string, string>) => parseFloat(v.close));
      saveCloses(tdSym, closes, lastDate);
      return closes;
    }
  } catch { /* ignore */ }
  return cached;
}

export function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  return closes.slice(-n).reduce((a, b) => a + b, 0) / n;
}
