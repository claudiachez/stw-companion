import { useState, useEffect, useRef } from 'react';
import { trendBucket } from '@stw/shared';
import type { MacroIndicator } from '@stw/shared';
import { tdDailyCloses, loadCloses, loadLastDate, sma } from './maCache';

// ── Module 4: Trend / Market Structure ──────────────────────────────
// Only price-trend assets live here. VIX moved to Volatility/Stress and US10Y
// to Rates+Dollar — neither is an equity-momentum row.
export const ALL_INDICATORS: { symbol: string; name: string }[] = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'QQQ', name: 'Nasdaq 100' },
  { symbol: 'IWM', name: 'Russell 2000' },
  { symbol: 'RSP', name: 'Equal-Weight S&P 500' },
  { symbol: 'VEA', name: "Intl Dev'd Markets" },
];

export const DEFAULT_TREND_SYMBOLS = ['SPY', 'QQQ'];
export const EXPERT_TREND_SYMBOLS = ['IWM', 'RSP', 'VEA'];

const PRICE_TTL = 15 * 60 * 1000; // 15 min

export function useMacroIndicators(symbols: string[], finnhubKey?: string, twelveDataKey?: string) {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
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
      // 1. Daily closes (TwelveData) for MA computation — shared 1-day cache.
      const maMap: Record<string, number[]> = {};
      await Promise.all(symbols.map(async (sym) => {
        if (twelveDataKey) maMap[sym] = await tdDailyCloses(sym, twelveDataKey, 252);
        else maMap[sym] = loadCloses(sym);
      }));

      if (cancelled) return;

      // 2. Live quotes (Finnhub) — 15-min localStorage cache, staggered.
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
        setAsOf(loadLastDate(symbols[0]));
        setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [symbols.join(','), finnhubKey, twelveDataKey]);

  return { indicators, loading, asOf };
}
