import { useState, useEffect } from 'react';
import {
  hv30, vixScore, vvixScore, ivPremiumScore, vixDirectionScore,
  volatilityStressScore, percentileRank,
} from '@stw/shared';
import { loadCloses, finnhubQuote, tdDailyCloses, loadLastDate } from './maCache';

// ── Module 5: Volatility / Stress ───────────────────────────────────
// VIX/VVIX are index symbols Finnhub's free tier often won't serve, so we take
// the live quote when available and fall back to the last TwelveData daily close.
// Daily history (TwelveData) also drives the 1-yr percentile + 5D direction.

export interface VolatilityStress {
  vix: number | null;
  vixPercentile: number | null;   // trailing ~1yr
  vixDelta5: number | null;       // VIX points, 5 trading days
  vvix: number | null;
  spyHv30: number | null;
  ivPremium: number | null;       // VIX ÷ 30D realized vol
  subScores: { vix: number | null; vvix: number | null; ivPremium: number | null; direction: number | null };
  sleeveScore: number | null;
  asOf: string | null;            // latest daily-history bar date
}

export function useVolatilityStress(finnhubKey?: string, twelveDataKey?: string) {
  const [data, setData] = useState<VolatilityStress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function compute() {
      // VIX: live quote first, else last daily close. Daily series → percentile + direction.
      const vixCloses = twelveDataKey ? await tdDailyCloses('VIX', twelveDataKey) : [];
      let vix: number | null = finnhubKey ? await finnhubQuote('^VIX', finnhubKey) : null;
      if (vix === null && vixCloses.length) vix = vixCloses[vixCloses.length - 1];

      // VVIX: Finnhub first, else TwelveData daily (often unavailable on free tier → skip).
      let vvix: number | null = finnhubKey ? await finnhubQuote('^VVIX', finnhubKey) : null;
      if (vvix === null && twelveDataKey) {
        const vvixCloses = await tdDailyCloses('VVIX', twelveDataKey, 30);
        if (vvixCloses.length) vvix = vvixCloses[vvixCloses.length - 1];
      }

      // IV premium = VIX ÷ 30D realized vol on SPY (reuse the trend hook's SPY cache).
      let spyCloses = loadCloses('SPY');
      if (spyCloses.length < 31 && twelveDataKey) spyCloses = await tdDailyCloses('SPY', twelveDataKey);
      const spyHv30 = hv30(spyCloses);
      const ivPremium = vix !== null && spyHv30 !== null && spyHv30 > 0 ? vix / spyHv30 : null;

      const vixPercentile = vix !== null && vixCloses.length ? percentileRank(vix, vixCloses.slice(-252)) : null;
      const vixDelta5 = vixCloses.length >= 6
        ? vixCloses[vixCloses.length - 1] - vixCloses[vixCloses.length - 6]
        : null;

      const subScores = {
        vix: vixScore(vix),
        vvix: vvixScore(vvix),
        ivPremium: ivPremiumScore(ivPremium),
        direction: vixDirectionScore(vixDelta5),
      };
      const sleeveScore = volatilityStressScore([subScores.vix, subScores.vvix, subScores.ivPremium, subScores.direction]);

      if (!cancelled) {
        setData({ vix, vixPercentile, vixDelta5, vvix, spyHv30, ivPremium, subScores, sleeveScore, asOf: loadLastDate('VIX') });
        setLoading(false);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, [finnhubKey, twelveDataKey]);

  return { data, loading };
}
