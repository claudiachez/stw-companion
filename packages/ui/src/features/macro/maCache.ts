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

const PRICE_TTL = 15 * 60 * 1000; // 15 min — matches useMacroIndicators' quote cache

/**
 * Live prices for several symbols at once, sharing the same `stw-price-cache`
 * localStorage entry (15-min TTL) that useMacroIndicators writes — so a symbol
 * fetched by one macro surface is reused by another, and the live trend
 * classification is identical wherever it's read. Calls are staggered ~1.1s to
 * respect Finnhub's free 60/min cap; a missing/failed quote is simply absent
 * (the caller falls back to the daily close). Returns { symbol: livePrice }.
 */
export async function liveQuotesCached(symbols: string[], key?: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  let cache: Record<string, { data: { c: number; d: number; dp: number }; ts: number }> = {};
  try { cache = JSON.parse(localStorage.getItem('stw-price-cache') || '{}'); } catch { /* ignore */ }
  const now = Date.now();
  const stale: string[] = [];
  for (const s of symbols) {
    const e = cache[s];
    if (e && now - e.ts < PRICE_TTL && e.data?.c) out[s] = e.data.c;
    else stale.push(s);
  }
  if (stale.length > 0 && key) {
    await Promise.all(stale.map((s, i) => new Promise<void>((resolve) => {
      setTimeout(async () => {
        try {
          const d = await (await fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${key}`)).json();
          if (d.c) { out[s] = d.c; cache[s] = { data: { c: d.c, d: d.d ?? 0, dp: d.dp ?? 0 }, ts: now }; }
        } catch { /* ignore */ }
        resolve();
      }, i * 1100);
    })));
    try { localStorage.setItem('stw-price-cache', JSON.stringify(cache)); } catch { /* ignore */ }
  }
  return out;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// TwelveData's free tier bills ONE credit per symbol, not per HTTP call — a
// single request for N comma-joined symbols still costs N credits. The plan
// caps at 8 credits/minute, so any fetch (batched or not) touching more than
// 8 uncached symbols must be split into ≤8-symbol chunks with a pause between
// them long enough to clear the per-minute window (60s + a safety margin).
const TD_CHUNK_SIZE = 8;
const TD_CHUNK_DELAY_MS = 65_000;

/**
 * Fetch daily closes for multiple symbols from TwelveData, cached for the day.
 * Splits into ≤8-symbol chunks (one comma-joined HTTP call per chunk) paced
 * ~65s apart so a large symbol list never exceeds the free tier's 8-credit/min
 * cap. Already-cached symbols are served from localStorage without any network
 * call or pacing delay.
 */
export async function tdBatchCloses(
  symbols: string[],
  key: string,
  outputsize = 252,
): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  const toFetch = symbols.filter((sym) => {
    const cached = loadCloses(sym);
    if (cached.length > 0 && cacheFresh(sym)) { result[sym] = cached; return false; }
    return true;
  });
  if (toFetch.length === 0) return result;

  for (let i = 0; i < toFetch.length; i += TD_CHUNK_SIZE) {
    const chunk = toFetch.slice(i, i + TD_CHUNK_SIZE);
    try {
      const symList = chunk.join(',');
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symList)}&interval=1day&outputsize=${outputsize}&timezone=UTC&apikey=${key}`;
      const data = await (await fetch(url)).json() as Record<string, unknown>;

      for (const sym of chunk) {
        // Single-symbol responses come back as { status, values } directly;
        // multi-symbol responses come back as { SYM: { status, values } }.
        const d = (chunk.length === 1 ? data : data[sym]) as Record<string, unknown> | undefined;
        if (d?.status === 'ok' && Array.isArray(d.values)) {
          const vals = d.values as Record<string, string>[];
          const lastDate = vals[0]?.datetime ?? null;
          const closes = [...vals].reverse().map((v) => parseFloat(v.close)).filter((v) => !isNaN(v));
          saveCloses(sym, closes, lastDate);
          result[sym] = closes;
        } else {
          result[sym] = loadCloses(sym); // stale cache fallback
        }
      }
    } catch {
      for (const sym of chunk) result[sym] = loadCloses(sym);
    }
    if (i + TD_CHUNK_SIZE < toFetch.length) await delay(TD_CHUNK_DELAY_MS);
  }
  return result;
}

/**
 * Daily closes for many symbols, fetched in small sequential chunks so a large
 * symbol list (e.g. sector constituents) doesn't blow through TwelveData's
 * free-tier rate limit the way one big Promise.all would. Already-cached
 * symbols resolve instantly and don't count against the pacing delay.
 */
export async function fetchClosesChunked(
  symbols: string[],
  key: string,
  outputsize = 252,
  chunkSize = TD_CHUNK_SIZE,
  delayMs = TD_CHUNK_DELAY_MS,
): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    const needsFetch = chunk.some((sym) => !cacheFresh(sym));
    await Promise.all(chunk.map(async (sym) => {
      result[sym] = await tdDailyCloses(sym, key, outputsize);
    }));
    if (needsFetch && i + chunkSize < symbols.length) await delay(delayMs);
  }
  return result;
}
