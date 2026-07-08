import { useState, useEffect } from 'react';
import { creditOasScore, FRED_SERIES } from '@stw/shared';
import { sma } from './maCache';
import { fredCloses, loadFredLastDate } from './fredCache';

// ── Module 6: Credit / Liquidity ────────────────────────────────────
// Now the real ICE BofA US High Yield option-adjusted spread (FRED
// BAMLH0A0HYM2) rather than the old HYG price proxy. It's a SPREAD, so the sign
// inverts: a spread below its 50D MA and tightening is credit confirming; above
// and widening is stress (see creditOasScore).

export interface CreditLiquidity {
  oas: number | null;          // HY OAS, percent
  oas50: number | null;        // 50D MA of the spread
  belowMa50: boolean | null;   // spread below its 50D MA = tight (good)
  tightening: boolean | null;  // spread falling day-over-day = good
  delta5: number | null;       // 5-day change in spread, points (+ = widening = bad)
  sleeveScore: number | null;
  asOf: string | null;
  updatedAt: string;           // when this was last refreshed (ISO)
}

export function useCreditLiquidity() {
  const [data, setData] = useState<CreditLiquidity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function compute() {
      const closes = await fredCloses(FRED_SERIES.hyOas);
      const oas = closes.length ? closes[closes.length - 1] : null;
      const prev = closes.length >= 2 ? closes[closes.length - 2] : null;
      const oas50 = sma(closes, 50);
      const prior5 = closes.length >= 6 ? closes[closes.length - 6] : null;

      const belowMa50 = oas !== null && oas50 !== null ? oas < oas50 : null;
      const tightening = oas !== null && prev !== null ? oas < prev : null;
      const delta5 = oas !== null && prior5 !== null ? oas - prior5 : null;
      const sleeveScore = belowMa50 !== null && tightening !== null ? creditOasScore(belowMa50, tightening) : null;

      if (!cancelled) {
        setData({ oas, oas50, belowMa50, tightening, delta5, sleeveScore, asOf: loadFredLastDate(FRED_SERIES.hyOas), updatedAt: new Date().toISOString() });
        setLoading(false);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
