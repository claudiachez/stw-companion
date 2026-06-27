import { useState, useEffect, useRef } from 'react';
import { trendBucket } from '@stw/shared';
import type { MacroIndicator } from '@stw/shared';

// ── Module 4: Trend / Market Structure ──────────────────────────────
// Only price-trend assets live here. VIX moved to Volatility/Stress and US10Y
// to Rates+Dollar — neither is an equity-momentum row, so they are NOT fetched
// by this hook anymore.
export const ALL_INDICATORS: { symbol: string; name: string }[] = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'QQQ', name: 'Nasdaq 100' },
  { symbol: 'IWM', name: 'Russell 2000' },
  { symbol: 'RSP', name: 'Equal-Weight S&P 500' },
  { symbol: 'VEA', name: "Intl Dev'd Markets" },
];

export const DEFAULT_TREND_SYMBOLS = ['SPY', 'QQQ'];
export const EXPERT_TREND_SYMBOLS = ['IWM', 'RSP', 'VEA'];

const PRICE_TTL = 15 * 60 * 1000;          // 15 min
const MA_TTL    = 24 * 60 * 60 * 1000;     // 1 day
const MA_LS_PREFIX = 'macro-ma-';

interface MaData { closes: number[]; date: string }

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadMaCache(symbol: string): MaData | null {
  try {
    const raw = localStorage.getItem(MA_LS_PREFIX + symbol);
    if (!raw) return null;
    const d = JSON.parse(raw) as MaData & { ts?: number };
    if (d.date !== todayStr() && (d.ts ?? 0) + MA_TTL < Date.now()) return null;
    return d;
  } catch { return null; }
}

function saveMaCache(symbol: string, closes: number[]) {
  try {
    localStorage.setItem(MA_LS_PREFIX + symbol, JSON.stringify({ closes, date: todayStr(), ts: Date.now() }));
  } catch { /* ignore */ }
}

function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  const slice = closes.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

export function useMacroIndicators(symbols: string[], finnhubKey?: string, twelveDataKey?: string) {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (symbols.length === 0) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);

    async function fetchAll() {
      // 1. Daily closes from TwelveData for MA computation (1-day cache).
      const maMap: Record<string, number[]> = {};
      await Promise.all(symbols.map(async (sym) => {
        const cached = loadMaCache(sym);
        if (cached) { maMap[sym] = cached.closes; return; }
        if (!twelveDataKey) return;
        try {
          const url = `https://api.twelvedata.com/time_series?symbol=${sym}&interval=1day&outputsize=210&timezone=UTC&apikey=${twelveDataKey}`;
          const d = await (await fetch(url)).json();
          if (d.status === 'ok' && d.values?.length) {
            const closes = [...d.values].reverse().map((v: Record<string, string>) => parseFloat(v.close));
            maMap[sym] = closes;
            saveMaCache(sym, closes);
          }
        } catch { /* ignore */ }
      }));

      if (cancelled) return;

      // 2. Live quotes from Finnhub (15-min localStorage cache, staggered).
      const quoteMap: Record<string, { c: number; d: number; dp: number }> = {};
      const now = Date.now();
      const lsRaw = localStorage.getItem('stw-price-cache');
      const priceCache: Record<string, { data: { c: number; d: number; dp: number }; ts: number }> = lsRaw ? JSON.parse(lsRaw) : {};

      const stale = symbols.filter((sym) => {
        const e = priceCache[sym];
        if (e && now - e.ts < PRICE_TTL) { quoteMap[sym] = e.data; return false; }
        return true;
      });

      if (stale.length > 0 && finnhubKey) {
        await Promise.all(stale.map((sym, i) => new Promise<void>((resolve) => {
          setTimeout(async () => {
            try {
              const d = await (await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`)).json();
              if (d.c) {
                quoteMap[sym] = { c: d.c, d: d.d ?? 0, dp: d.dp ?? 0 };
                priceCache[sym] = { data: quoteMap[sym], ts: now };
              }
            } catch { /* ignore */ }
            resolve();
          }, i * 1100);
        })));
        try { localStorage.setItem('stw-price-cache', JSON.stringify(priceCache)); } catch { /* ignore */ }
      }

      if (cancelled) return;

      // 3. Assemble indicators + structure bucket.
      const result: MacroIndicator[] = symbols.map((sym) => {
        const meta = ALL_INDICATORS.find((x) => x.symbol === sym) ?? { symbol: sym, name: sym };
        const closes = maMap[sym] ?? [];
        const quote = quoteMap[sym];
        const close = quote?.c ?? (closes.length > 0 ? closes[closes.length - 1] : null);
        const ma9 = sma(closes, 9);
        const ma21 = sma(closes, 21);
        const ma200 = sma(closes, 200);
        return {
          symbol: sym,
          name: meta.name,
          close,
          chg: quote?.d ?? null,
          chgPct: quote?.dp ?? null,
          ma9, ma21, ma200,
          bucket: trendBucket(close, ma9, ma21, ma200),
        };
      });

      if (!cancelled && mountedRef.current) {
        setIndicators(result);
        setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [symbols.join(','), finnhubKey, twelveDataKey]);

  return { indicators, loading };
}
