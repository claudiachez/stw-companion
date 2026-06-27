import { useState, useEffect } from 'react';
import {
  hv30, vixScore, vvixScore, ivPremiumScore, vixDirectionScore,
  volatilityStressScore, percentileRank,
} from '@stw/shared';

// ── Module 5: Volatility / Stress ───────────────────────────────────
// VIX/VVIX are index symbols Finnhub's free tier often won't serve, so we take
// the live quote when available and fall back to the last TwelveData daily close.
// Daily history (TwelveData) also drives the 1-yr percentile + 5D direction.

const MA_PREFIX = 'macro-ma-';
const MA_TTL = 24 * 60 * 60 * 1000;

export interface VolatilityStress {
  vix: number | null;
  vixPercentile: number | null;   // trailing ~1yr
  vixDelta5: number | null;       // VIX points, 5 trading days
  vvix: number | null;
  spyHv30: number | null;
  ivPremium: number | null;       // VIX ÷ 30D realized vol
  subScores: { vix: number | null; vvix: number | null; ivPremium: number | null; direction: number | null };
  sleeveScore: number | null;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function loadCloses(symbol: string): number[] {
  try {
    const raw = localStorage.getItem(MA_PREFIX + symbol);
    if (!raw) return [];
    return (JSON.parse(raw) as { closes: number[] }).closes ?? [];
  } catch { return []; }
}

function saveCloses(symbol: string, closes: number[]) {
  try { localStorage.setItem(MA_PREFIX + symbol, JSON.stringify({ closes, date: todayStr(), ts: Date.now() })); }
  catch { /* ignore */ }
}

function cacheFresh(symbol: string): boolean {
  try {
    const raw = localStorage.getItem(MA_PREFIX + symbol);
    if (!raw) return false;
    const d = JSON.parse(raw) as { date?: string; ts?: number };
    return d.date === todayStr() || (d.ts ?? 0) + MA_TTL > Date.now();
  } catch { return false; }
}

async function finnhubQuote(fhSym: string, key: string): Promise<number | null> {
  try {
    const d = await (await fetch(`https://finnhub.io/api/v1/quote?symbol=${fhSym}&token=${key}`)).json();
    return d.c || null;
  } catch { return null; }
}

async function tdDailyCloses(tdSym: string, key: string, outputsize = 252): Promise<number[]> {
  const cached = loadCloses(tdSym);
  if (cached.length > 0 && cacheFresh(tdSym)) return cached;
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${tdSym}&interval=1day&outputsize=${outputsize}&timezone=UTC&apikey=${key}`;
    const d = await (await fetch(url)).json();
    if (d.status === 'ok' && d.values?.length) {
      const closes = [...d.values].reverse().map((v: Record<string, string>) => parseFloat(v.close));
      saveCloses(tdSym, closes);
      return closes;
    }
  } catch { /* ignore */ }
  return cached;
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
        setData({ vix, vixPercentile, vixDelta5, vvix, spyHv30, ivPremium, subScores, sleeveScore });
        setLoading(false);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, [finnhubKey, twelveDataKey]);

  return { data, loading };
}
