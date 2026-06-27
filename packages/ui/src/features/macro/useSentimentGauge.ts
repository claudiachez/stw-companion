import { useState, useEffect } from 'react';
import { fetchGraddox } from '../signals/api';
import type { SentimentInput, SentimentScore } from '@stw/shared';

const TD_SYMBOL: Record<string, string> = { HYG: 'HYG', UUP: 'UUP', SPY: 'SPY' };
const FH_SYMBOL: Record<string, string> = { VIX: '^VIX', VVIX: '^VVIX' };
const MA_PREFIX = 'macro-ma-';

function loadCloses(symbol: string): number[] {
  try {
    const raw = localStorage.getItem(MA_PREFIX + symbol);
    if (!raw) return [];
    return (JSON.parse(raw) as { closes: number[] }).closes ?? [];
  } catch { return []; }
}

function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  return closes.slice(-n).reduce((a, b) => a + b, 0) / n;
}

function hv30(closes: number[]): number | null {
  if (closes.length < 31) return null;
  const slice = closes.slice(-31);
  const logRets = slice.slice(1).map((c, i) => Math.log(c / slice[i]));
  const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
  const variance = logRets.reduce((a, b) => a + (b - mean) ** 2, 0) / logRets.length;
  return Math.sqrt(variance * 252) * 100;
}

async function fetchQuote(sym: string, finnhubKey: string): Promise<number | null> {
  const fhSym = FH_SYMBOL[sym] ?? sym;
  try {
    const d = await (await fetch(`https://finnhub.io/api/v1/quote?symbol=${fhSym}&token=${finnhubKey}`)).json();
    return d.c ?? null;
  } catch { return null; }
}

async function fetchDailyCloses(sym: string, twelveDataKey: string): Promise<number[]> {
  const cached = loadCloses(sym);
  if (cached.length > 0) return cached;
  const tdSym = TD_SYMBOL[sym] ?? sym;
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${tdSym}&interval=1day&outputsize=60&timezone=UTC&apikey=${twelveDataKey}`;
    const d = await (await fetch(url)).json();
    if (d.status === 'ok' && d.values?.length) {
      const closes = [...d.values].reverse().map((v: Record<string, string>) => parseFloat(v.close));
      try { localStorage.setItem(MA_PREFIX + sym, JSON.stringify({ closes, date: new Date().toISOString().slice(0, 10), ts: Date.now() })); } catch { /* ignore */ }
      return closes;
    }
  } catch { /* ignore */ }
  return [];
}

export function useSentimentGauge(finnhubKey?: string, twelveDataKey?: string) {
  const [score, setScore] = useState<SentimentScore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!finnhubKey) { setLoading(false); return; }
    let cancelled = false;

    async function compute() {
      const inputs: SentimentInput[] = [];

      // 1. Market Momentum (18%) — SPY % above/below 125d MA normalized ±10% → 0–100
      const spyCloses = loadCloses('SPY');
      const spy125 = sma(spyCloses, 125);
      const spyClose = spyCloses[spyCloses.length - 1] ?? null;
      let momentumScore: number | null = null;
      if (spy125 && spyClose) {
        const pct = (spyClose - spy125) / spy125 * 100;
        momentumScore = Math.max(0, Math.min(100, 50 + pct * 5));
      }
      inputs.push({ label: 'Market Momentum', weight: 0.18, score: momentumScore, description: 'SPY vs 125d MA' });

      // 2. Volatility Level (16%) — VIX levels
      const vix = await fetchQuote('VIX', finnhubKey!);
      let volScore: number | null = null;
      if (vix !== null) {
        if (vix < 12) volScore = 100;
        else if (vix < 16) volScore = 75;
        else if (vix < 20) volScore = 50;
        else if (vix < 25) volScore = 25;
        else volScore = 0;
      }
      inputs.push({ label: 'Volatility (VIX)', weight: 0.16, score: volScore, description: `VIX ${vix?.toFixed(1) ?? '—'}` });

      // 3. IV Premium / vol ratio (16%)
      const spyHv = hv30(spyCloses);
      let ivPremiumScore: number | null = null;
      if (vix !== null && spyHv !== null && spyHv > 0) {
        const ratio = vix / spyHv;
        if (ratio > 1.3) ivPremiumScore = 20;
        else if (ratio > 1.0) ivPremiumScore = 50;
        else ivPremiumScore = 80;
      }
      inputs.push({ label: 'IV Premium', weight: 0.16, score: ivPremiumScore, description: 'VIX ÷ 30d realized HV' });

      // 4. Tail Risk — VVIX (12%)
      let tailScore: number | null = null;
      try {
        const vvix = await fetchQuote('VVIX', finnhubKey!);
        if (vvix !== null) {
          if (vvix < 85) tailScore = 80;
          else if (vvix < 100) tailScore = 50;
          else tailScore = 20;
        }
      } catch { /* VVIX may not be available on free tier */ }
      inputs.push({ label: 'Tail Risk (VVIX)', weight: tailScore !== null ? 0.12 : 0, score: tailScore, description: 'Vol-of-vol level' });

      // 5. GEX Bias (18%)
      let gexScore: number | null = null;
      try {
        const gex = await fetchGraddox();
        if (gex?.bias) {
          const b = gex.bias.toLowerCase();
          if (b.includes('bull')) gexScore = 90;
          else if (b.includes('bear')) gexScore = 10;
          else if (b.includes('conflict')) gexScore = 35;
          else gexScore = 50;
        }
      } catch { /* ignore */ }
      inputs.push({ label: 'GEX Bias', weight: 0.18, score: gexScore, description: 'Graddox daily signal' });

      // 6. Credit (10%) — HYG vs 50d MA
      let creditScore: number | null = null;
      if (twelveDataKey) {
        const hygCloses = await fetchDailyCloses('HYG', twelveDataKey);
        const hyg50 = sma(hygCloses, 50);
        const hygNow = hygCloses[hygCloses.length - 1] ?? null;
        const hygPrev = hygCloses[hygCloses.length - 2] ?? null;
        if (hyg50 && hygNow && hygPrev) {
          const above = hygNow > hyg50;
          const rising = hygNow > hygPrev;
          if (above && rising) creditScore = 80;
          else if (above || rising) creditScore = 50;
          else creditScore = 20;
        }
      }
      inputs.push({ label: 'Credit (HYG)', weight: 0.10, score: creditScore, description: 'HYG vs 50d MA' });

      // 7. Dollar (UUP) (10%) — UUP vs 9+21d MA
      let dollarScore: number | null = null;
      if (twelveDataKey) {
        const uupCloses = await fetchDailyCloses('UUP', twelveDataKey);
        const uup9 = sma(uupCloses, 9);
        const uup21 = sma(uupCloses, 21);
        const uupNow = uupCloses[uupCloses.length - 1] ?? null;
        if (uup9 && uup21 && uupNow) {
          if (uupNow < uup9 && uupNow < uup21) dollarScore = 80;
          else if (uupNow > uup9 && uupNow > uup21) dollarScore = 20;
          else dollarScore = 50;
        }
      }
      inputs.push({ label: 'Dollar (UUP)', weight: 0.10, score: dollarScore, description: 'UUP vs 9+21d MA' });

      // Redistribute weight if VVIX is null
      const activeInputs = inputs.filter((x) => x.score !== null && x.weight > 0);
      const totalWeight = activeInputs.reduce((a, x) => a + x.weight, 0);

      let total: number | null = null;
      if (activeInputs.length > 0 && totalWeight > 0) {
        total = activeInputs.reduce((a, x) => a + (x.score! * x.weight), 0) / totalWeight;
        total = Math.round(total);
      }

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
