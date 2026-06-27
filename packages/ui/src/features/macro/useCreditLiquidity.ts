import { useState, useEffect } from 'react';
import { creditHygScore } from '@stw/shared';
import { tdDailyCloses, sma, loadLastDate } from './maCache';

// ── Module 6: Credit / Liquidity ────────────────────────────────────
// v1 credit proxy = HYG vs its 50D MA + direction. Labeled a proxy in the UI;
// ICE BofA HY OAS is the cleaner input, deferred to a later pass.

export interface CreditLiquidity {
  hyg: number | null;
  hyg50: number | null;
  aboveMa50: boolean | null;
  rising: boolean | null;
  delta5Pct: number | null;   // 5-day % change
  sleeveScore: number | null;
  asOf: string | null;
}

export function useCreditLiquidity(twelveDataKey?: string) {
  const [data, setData] = useState<CreditLiquidity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!twelveDataKey) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    async function compute() {
      const closes = await tdDailyCloses('HYG', twelveDataKey!);
      const hyg = closes.length ? closes[closes.length - 1] : null;
      const prev = closes.length >= 2 ? closes[closes.length - 2] : null;
      const hyg50 = sma(closes, 50);
      const prior5 = closes.length >= 6 ? closes[closes.length - 6] : null;

      const aboveMa50 = hyg !== null && hyg50 !== null ? hyg > hyg50 : null;
      const rising = hyg !== null && prev !== null ? hyg > prev : null;
      const delta5Pct = hyg !== null && prior5 ? ((hyg - prior5) / prior5) * 100 : null;
      const sleeveScore = aboveMa50 !== null && rising !== null ? creditHygScore(aboveMa50, rising) : null;

      if (!cancelled) {
        setData({ hyg, hyg50, aboveMa50, rising, delta5Pct, sleeveScore, asOf: loadLastDate('HYG') });
        setLoading(false);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, [twelveDataKey]);

  return { data, loading };
}
