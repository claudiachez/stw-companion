import { useState, useEffect } from 'react';
import { us10yScore, uupScore, ratesDollarScore, FRED_SERIES } from '@stw/shared';
import { sma } from './maCache';
import { fredBatch, loadFredLastDate } from './fredCache';

// ── Module 7: Rates + Dollar Headwinds ──────────────────────────────
// US10Y is the 10-Year Treasury yield from FRED (DGS10, already a percent — no
// more ×10 CBOE-TNX normalization). The dollar is FRED's Nominal Broad U.S.
// Dollar Index (DTWEXBGS, the actual index vs the old UUP ETF proxy), read via
// its 9/21-day MA cross. Both come through the `fred` proxy.

export interface RatesDollar {
  us10y: number | null;        // yield %
  us10yDelta1: number | null;  // yield points vs yesterday's close
  us10yDelta5: number | null;  // yield points over 5 trading days
  dollar: number | null;       // broad dollar index level
  dollarAbove9: boolean | null;
  dollarAbove21: boolean | null;
  subScores: { us10y: number | null; dollar: number | null };
  sleeveScore: number | null;
  asOf: string | null;
  updatedAt: string;           // when this was last refreshed (ISO)
}

export function useRatesDollar(stressRising: boolean) {
  const [data, setData] = useState<RatesDollar | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function compute() {
      const closes = await fredBatch([FRED_SERIES.us10y, FRED_SERIES.dollar]);

      // US10Y via FRED DGS10 (yield %, no normalization needed).
      const tnxCloses = closes[FRED_SERIES.us10y] ?? [];
      const us10y = tnxCloses.length ? tnxCloses[tnxCloses.length - 1] : null;
      const us10yDelta1 = tnxCloses.length >= 2 ? tnxCloses[tnxCloses.length - 1] - tnxCloses[tnxCloses.length - 2] : null;
      const us10yDelta5 = tnxCloses.length >= 6 ? tnxCloses[tnxCloses.length - 1] - tnxCloses[tnxCloses.length - 6] : null;

      // Dollar via FRED DTWEXBGS broad index vs its 9/21D MAs.
      const dollarCloses = closes[FRED_SERIES.dollar] ?? [];
      const dollar = dollarCloses.length ? dollarCloses[dollarCloses.length - 1] : null;
      const d9 = sma(dollarCloses, 9);
      const d21 = sma(dollarCloses, 21);
      const dollarAbove9 = dollar !== null && d9 !== null ? dollar > d9 : null;
      const dollarAbove21 = dollar !== null && d21 !== null ? dollar > d21 : null;

      const subScores = {
        us10y: us10yScore(us10y, us10yDelta5, stressRising),
        dollar: dollarAbove9 !== null && dollarAbove21 !== null ? uupScore(dollarAbove9, dollarAbove21) : null,
      };
      const sleeveScore = ratesDollarScore([subScores.us10y, subScores.dollar]);

      if (!cancelled) {
        setData({ us10y, us10yDelta1, us10yDelta5, dollar, dollarAbove9, dollarAbove21, subScores, sleeveScore, asOf: loadFredLastDate(FRED_SERIES.us10y), updatedAt: new Date().toISOString() });
        setLoading(false);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, [stressRising]);

  return { data, loading };
}
