import { useState, useEffect } from 'react';
import {
  hv30, vixScore, ivPremiumScore, gexScore, creditHygScore,
  breadthScore, RISK_APPETITE_WEIGHTS, riskAppetiteScore,
} from '@stw/shared';
import { fetchGraddox } from '../signals/api';
import { loadCloses, tdDailyCloses, finnhubQuote, sma } from './maCache';
import type { SentimentInput, SentimentScore } from '@stw/shared';

// ── Module 9: Risk Appetite ─────────────────────────────────────────
// A separate score from the Market Regime — "how much fear/greed is priced
// right now?". Dollar moved to the Rates+Dollar sleeve; Breadth (RSP/SPY) added.
// VVIX/Tail-Risk removed 2026-07-08 (no free feed serves it). The other six
// weights kept their relative proportions, so the gauge is materially unchanged
// from when VVIX was perpetually null.

export function useSentimentGauge(finnhubKey?: string, twelveDataKey?: string) {
  const [score, setScore] = useState<SentimentScore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function compute() {
      const inputs: SentimentInput[] = [];

      // 1. Market Momentum (18%) — SPY % above/below its 125d MA, ±10% → 0–100.
      let spyCloses = loadCloses('SPY');
      if (spyCloses.length < 126 && twelveDataKey) spyCloses = await tdDailyCloses('SPY', twelveDataKey);
      const spy125 = sma(spyCloses, 125);
      const spyClose = spyCloses[spyCloses.length - 1] ?? null;
      let momentumScore: number | null = null;
      if (spy125 && spyClose) {
        const pct = ((spyClose - spy125) / spy125) * 100;
        momentumScore = Math.max(0, Math.min(100, 50 + pct * 5));
      }
      inputs.push({ label: 'Market Momentum', weight: RISK_APPETITE_WEIGHTS.momentum, score: momentumScore, description: 'SPY vs 125d MA' });

      // 2. Volatility (16%) — VIX level (Finnhub, TwelveData fallback).
      let vix: number | null = finnhubKey ? await finnhubQuote('^VIX', finnhubKey) : null;
      const vixCloses = twelveDataKey ? await tdDailyCloses('VIX', twelveDataKey) : loadCloses('VIX');
      if (vix === null && vixCloses.length) vix = vixCloses[vixCloses.length - 1];
      const vixSc = vixScore(vix);
      inputs.push({ label: 'Volatility (VIX)', weight: RISK_APPETITE_WEIGHTS.vix, score: vixSc, description: `VIX ${vix?.toFixed(1) ?? '—'}` });

      // 3. IV Premium (16%) — VIX ÷ 30d realized vol on SPY.
      const spyHv = hv30(spyCloses);
      const ivRatio = vix !== null && spyHv !== null && spyHv > 0 ? vix / spyHv : null;
      const ivSc = ivPremiumScore(ivRatio);
      inputs.push({ label: 'IV Premium', weight: RISK_APPETITE_WEIGHTS.ivPremium, score: ivSc, description: 'VIX ÷ 30d realized HV' });

      // 4. GEX Bias (18%) — tactical positioning.
      let gexInput: number | null = null;
      try {
        const gex = await fetchGraddox();
        gexInput = gexScore(gex?.bias);
      } catch { /* ignore */ }
      inputs.push({ label: 'GEX Bias', weight: RISK_APPETITE_WEIGHTS.gex, score: gexInput, description: 'Graddox daily signal' });

      // 5. Credit (10%) — HYG vs 50d MA.
      let creditScore: number | null = null;
      if (twelveDataKey) {
        const hyg = await tdDailyCloses('HYG', twelveDataKey);
        const hyg50 = sma(hyg, 50);
        const now = hyg[hyg.length - 1] ?? null;
        const prev = hyg[hyg.length - 2] ?? null;
        if (hyg50 && now && prev) creditScore = creditHygScore(now > hyg50, now > prev);
      }
      inputs.push({ label: 'Credit', weight: RISK_APPETITE_WEIGHTS.credit, score: creditScore, description: 'HYG vs 50d MA' });

      // 6. Breadth (10%) — RSP/SPY relative strength (is the average stock confirming?).
      let breadth: number | null = null;
      if (twelveDataKey) {
        const rsp = await tdDailyCloses('RSP', twelveDataKey);
        const L = Math.min(rsp.length, spyCloses.length);
        if (L >= 51) {
          const rspA = rsp.slice(-L);
          const spyA = spyCloses.slice(-L);
          const ratios = rspA.map((r, i) => r / spyA[i]);
          const ratioNow = ratios[ratios.length - 1];
          const ratioMa50 = ratios.slice(-50).reduce((a, b) => a + b, 0) / 50;
          const rising = ratioNow > ratios[ratios.length - 2];
          breadth = breadthScore(ratioNow > ratioMa50, rising);
        }
      }
      inputs.push({ label: 'Breadth', weight: RISK_APPETITE_WEIGHTS.breadth, score: breadth, description: 'RSP/SPY relative strength' });

      // Final score = weighted average over the available inputs (missing redistributes).
      // Shared with macro-snapshot.ts so the persisted trend matches this gauge.
      const total = riskAppetiteScore({
        momentum: momentumScore, vix: vixSc, ivPremium: ivSc,
        gex: gexInput, credit: creditScore, breadth,
      });

      if (!cancelled) {
        setScore({ total, inputs });
        setLoading(false);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, [finnhubKey, twelveDataKey]);

  return { score, loading };
}
