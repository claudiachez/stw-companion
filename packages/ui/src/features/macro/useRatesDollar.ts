import { useState, useEffect } from 'react';
import { us10yScore, uupScore, ratesDollarScore } from '@stw/shared';
import { tdDailyCloses, sma, loadLastDate } from './maCache';

// ── Module 7: Rates + Dollar Headwinds ──────────────────────────────
// US10Y shown as a yield %. TwelveData/CBOE 'TNX' quotes 10× the yield
// (42.5 = 4.25%), so normalize values >20 by /10.

function normalizeYield(v: number | null): number | null {
  if (v === null) return null;
  return v > 20 ? v / 10 : v;
}

export interface RatesDollar {
  us10y: number | null;        // yield %
  us10yDelta5: number | null;  // yield points over 5 trading days
  uup: number | null;
  uupAbove9: boolean | null;
  uupAbove21: boolean | null;
  subScores: { us10y: number | null; uup: number | null };
  sleeveScore: number | null;
  asOf: string | null;
}

export function useRatesDollar(twelveDataKey: string | undefined, stressRising: boolean) {
  const [data, setData] = useState<RatesDollar | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!twelveDataKey) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    async function compute() {
      // US10Y via CBOE TNX daily closes (normalized to a yield %).
      const tnxCloses = (await tdDailyCloses('TNX', twelveDataKey!)).map((c) => normalizeYield(c) as number);
      const us10y = tnxCloses.length ? tnxCloses[tnxCloses.length - 1] : null;
      const us10yDelta5 = tnxCloses.length >= 6 ? tnxCloses[tnxCloses.length - 1] - tnxCloses[tnxCloses.length - 6] : null;

      // UUP via daily closes vs 9/21D MAs.
      const uupCloses = await tdDailyCloses('UUP', twelveDataKey!, 60);
      const uup = uupCloses.length ? uupCloses[uupCloses.length - 1] : null;
      const uup9 = sma(uupCloses, 9);
      const uup21 = sma(uupCloses, 21);
      const uupAbove9 = uup !== null && uup9 !== null ? uup > uup9 : null;
      const uupAbove21 = uup !== null && uup21 !== null ? uup > uup21 : null;

      const subScores = {
        us10y: us10yScore(us10y, us10yDelta5, stressRising),
        uup: uupAbove9 !== null && uupAbove21 !== null ? uupScore(uupAbove9, uupAbove21) : null,
      };
      const sleeveScore = ratesDollarScore([subScores.us10y, subScores.uup]);

      if (!cancelled) {
        setData({ us10y, us10yDelta5, uup, uupAbove9, uupAbove21, subScores, sleeveScore, asOf: loadLastDate('TNX') });
        setLoading(false);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, [twelveDataKey, stressRising]);

  return { data, loading };
}
