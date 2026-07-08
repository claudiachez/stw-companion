import { useState, useEffect } from 'react';
import {
  hv30, vixScore, ivPremiumScore, vixDirectionScore,
  volatilityStressScore, percentileRank, FRED_SERIES,
} from '@stw/shared';
import { loadCloses, tdDailyCloses } from './maCache';
import { fredCloses, loadFredLastDate } from './fredCache';

// ── Module 5: Volatility / Stress ───────────────────────────────────
// VIX daily closes come from FRED (VIXCLS) via the `fred` proxy — the free
// Finnhub/TwelveData tiers throttled or wouldn't serve the index. The 1-yr
// percentile + 5D direction read off that same FRED series; the IV-premium ratio
// still uses SPY's 30D realized vol from the TwelveData daily cache.
// (VVIX was removed 2026-07-08 — no free feed serves it; see macro.ts.)

export interface VolatilityStress {
  vix: number | null;
  vixPercentile: number | null;   // trailing ~1yr
  vixDelta5: number | null;       // VIX points, 5 trading days
  spyHv30: number | null;
  ivPremium: number | null;       // VIX ÷ 30D realized vol
  subScores: { vix: number | null; ivPremium: number | null; direction: number | null };
  sleeveScore: number | null;
  asOf: string | null;            // latest daily-history bar date
  updatedAt: string;              // when this was last refreshed (ISO)
}

export function useVolatilityStress(twelveDataKey?: string) {
  const [data, setData] = useState<VolatilityStress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function compute() {
      // VIX from FRED (VIXCLS) — daily series drives value + percentile + 5D direction.
      const vixCloses = await fredCloses(FRED_SERIES.vix);
      const vix = vixCloses.length ? vixCloses[vixCloses.length - 1] : null;

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
        ivPremium: ivPremiumScore(ivPremium),
        direction: vixDirectionScore(vixDelta5),
      };
      const sleeveScore = volatilityStressScore([subScores.vix, subScores.ivPremium, subScores.direction]);

      if (!cancelled) {
        setData({ vix, vixPercentile, vixDelta5, spyHv30, ivPremium, subScores, sleeveScore, asOf: loadFredLastDate(FRED_SERIES.vix), updatedAt: new Date().toISOString() });
        setLoading(false);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, [twelveDataKey]);

  return { data, loading };
}
