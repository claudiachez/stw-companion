import { useState, useEffect, useRef } from 'react';
import type { MacroIndicator, MacroSignal, MacroTier } from '@stw/shared';

// All symbols we potentially display (default + expert)
export const ALL_INDICATORS: { symbol: string; name: string; isYield?: boolean }[] = [
  { symbol: 'SPY',   name: 'S&P 500'              },
  { symbol: 'QQQ',   name: 'Nasdaq 100'            },
  { symbol: 'VIX',   name: 'Volatility Index'      },
  { symbol: 'US10Y', name: '10-Yr Treasury Yield', isYield: true },
  { symbol: 'IWM',   name: 'Russell 2000'          },
  { symbol: 'RSP',   name: 'Equal-Weight S&P 500'  },
  { symbol: 'TLT',   name: 'Long-Duration Bonds'   },
  { symbol: 'HYG',   name: 'High-Yield Credit'     },
  { symbol: 'VEA',   name: "Intl Dev'd Markets"    },
];

// Finnhub symbol overrides
const FINNHUB_SYMBOL: Record<string, string> = {
  VIX:   '^VIX',
  US10Y: '^TNX',
};

// TwelveData symbol overrides
const TD_SYMBOL: Record<string, string> = {
  VIX:   'VIX',
  US10Y: 'TNX',
};

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

function computeSignal(close: number | null, ma9: number | null, ma21: number | null, ma200: number | null, isYield?: boolean): MacroSignal {
  if (close === null) return 'na';
  if (isYield) {
    if (close < 4.3) return 'bullish';
    if (close > 4.5) return 'bearish';
    return 'caution';
  }
  if (ma200 !== null && close > ma200 && ma9 !== null && close > ma9 && ma21 !== null && close > ma21) return 'bullish';
  if (ma200 !== null && close > ma200) return 'caution';
  if (ma9 !== null && ma21 !== null && ma200 !== null && close < ma9 && close < ma21 && close < ma200) return 'bearish';
  if (ma200 !== null && close < ma200) return 'bearish';
  return 'caution';
}

function computeTier(signal: MacroSignal): MacroTier | null {
  if (signal === 'bullish') return 'momentum';
  if (signal === 'caution') return 'mid-caution';
  if (signal === 'bearish') return 'risk-off';
  return null;
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
      // 1. Fetch daily closes from TwelveData for MA computation
      const maMap: Record<string, number[]> = {};
      await Promise.all(symbols.map(async (sym) => {
        const cached = loadMaCache(sym);
        if (cached) { maMap[sym] = cached.closes; return; }
        if (!twelveDataKey) return;
        const tdSym = TD_SYMBOL[sym] ?? sym;
        try {
          const url = `https://api.twelvedata.com/time_series?symbol=${tdSym}&interval=1day&outputsize=210&timezone=UTC&apikey=${twelveDataKey}`;
          const d = await (await fetch(url)).json();
          if (d.status === 'ok' && d.values?.length) {
            const closes = [...d.values].reverse().map((v: Record<string, string>) => parseFloat(v.close));
            maMap[sym] = closes;
            saveMaCache(sym, closes);
          }
        } catch { /* ignore */ }
      }));

      if (cancelled) return;

      // 2. Fetch live quotes from Finnhub
      const quoteMap: Record<string, { c: number; d: number; dp: number }> = {};

      // Check localStorage cache first
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
            const fhSym = FINNHUB_SYMBOL[sym] ?? sym;
            try {
              const d = await (await fetch(`https://finnhub.io/api/v1/quote?symbol=${fhSym}&token=${finnhubKey}`)).json();
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

      // 3. Assemble indicators
      const result: MacroIndicator[] = symbols.map((sym) => {
        const meta = ALL_INDICATORS.find((x) => x.symbol === sym)!;
        const closes = maMap[sym] ?? [];
        const quote = quoteMap[sym];
        const close = quote?.c ?? (closes.length > 0 ? closes[closes.length - 1] : null);
        const chg = quote?.d ?? null;
        const chgPct = quote?.dp ?? null;
        const ma9 = sma(closes, 9);
        const ma21 = sma(closes, 21);
        const ma200 = sma(closes, 200);
        const signal = computeSignal(close, ma9, ma21, ma200, meta.isYield);
        const tier = computeTier(signal);
        return { symbol: sym, name: meta.name, close, chg, chgPct, ma9, ma21, ma200, signal, tier, isYield: meta.isYield };
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
