/**
 * Macro Daily Snapshot — standalone writer for the 5D/20D trend engine.
 *
 * Runs on a fixed schedule (weekdays, 21:30 UTC ≈ 4:30pm ET) independent of
 * any user opening the app, and upserts one row per day into
 * `macro_daily_snapshots` (migration 048). This is the cross-device backing
 * store the spec calls the "v2 option" for useMacroTrendHistory.ts, which
 * otherwise only has a per-browser localStorage history.
 *
 * DST caveat: Netlify Scheduled Functions use a fixed UTC cron with no
 * timezone awareness. 21:30 UTC = 4:30pm EST / 5:30pm EDT — always safely
 * after the 4:00pm market close in both cases, so the "wrong" hour during
 * EDT just means a slightly later snapshot, never a pre-close one. Same
 * tradeoff already accepted by easternOffset() in macro-events.ts.
 *
 * This cannot reuse the browser hooks (useMacroIndicators, useVolatilityStress,
 * useCreditLiquidity, useRatesDollar, useSentimentGauge) because they all cache
 * through maCache.ts, which is localStorage-based and doesn't exist in a Netlify
 * Function. So the raw TwelveData/Finnhub fetches are re-implemented here —
 * but every scoring formula is imported from @stw/shared (no duplicated logic).
 *
 * Required Netlify env vars (server-side, no VITE_ prefix — the VITE_* vars
 * are inlined into the client bundle at build time and are NOT available here):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (already present for ibkr-flex.ts)
 *   FINNHUB_KEY, TWELVEDATA_KEY              (new — must be added in Netlify)
 *
 * Event risk is fetched from the already-deployed macro-events function
 * (internal HTTP call via process.env.URL) rather than duplicating its
 * MarketWatch scrape here.
 */
import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import {
  trendBucket, trendSleeveScore, environmentScore,
  vixScore, vvixScore, ivPremiumScore, vixDirectionScore, volatilityStressScore, percentileRank, hv30,
  creditHygScore, us10yScore, uupScore, ratesDollarScore, gexScore, breadthScore,
  classifyEventRisk,
} from '@stw/shared';
import type { MacroEvent } from '@stw/shared';

const TREND_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'RSP', 'VEA'];

function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  return closes.slice(-n).reduce((a, b) => a + b, 0) / n;
}

function normalizeYield(v: number | null): number | null {
  if (v === null) return null;
  return v > 20 ? v / 10 : v;
}

async function finnhubQuote(symbol: string, key: string): Promise<number | null> {
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`);
    const d = await res.json() as { c?: number };
    return d.c || null;
  } catch {
    return null;
  }
}

async function tdDailyCloses(symbol: string, key: string, outputsize = 252): Promise<number[]> {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${outputsize}&timezone=UTC&apikey=${key}`;
    const d = await (await fetch(url)).json() as { status?: string; values?: { close: string }[] };
    if (d.status === 'ok' && d.values?.length) {
      return [...d.values].reverse().map((v) => parseFloat(v.close));
    }
  } catch { /* ignore */ }
  return [];
}

async function fetchEventRisk(): Promise<{ events: MacroEvent[]; source: string; warning?: string }> {
  const base = process.env.URL ?? process.env.DEPLOY_URL;
  if (!base) return { events: [], source: 'unavailable', warning: 'No site URL available for internal fetch.' };
  try {
    const res = await fetch(`${base}/.netlify/functions/macro-events`);
    if (!res.ok) return { events: [], source: 'unavailable', warning: `macro-events HTTP ${res.status}` };
    return await res.json() as { events: MacroEvent[]; source: string; warning?: string };
  } catch (e) {
    return { events: [], source: 'unavailable', warning: e instanceof Error ? e.message : 'fetch failed' };
  }
}

const handlerImpl: Handler = async () => {
  const finnhubKey = process.env.FINNHUB_KEY;
  const twelveDataKey = process.env.TWELVEDATA_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }) };
  }
  if (!twelveDataKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing TWELVEDATA_KEY' }) };
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── Module 4: Trend / Market Structure ──────────────────────────────
  const indicatorScores: Record<string, number | null> = {};
  const buckets: Record<string, ReturnType<typeof trendBucket>> = {};
  for (const symbol of TREND_SYMBOLS) {
    const closes = await tdDailyCloses(symbol, twelveDataKey);
    const close = closes[closes.length - 1] ?? null;
    const ma9 = sma(closes, 9);
    const ma21 = sma(closes, 21);
    const ma200 = sma(closes, 200);
    const bucket = trendBucket(close, ma9, ma21, ma200);
    buckets[symbol] = bucket;
    indicatorScores[symbol] = bucket ? { momentum: 90, healthy_pullback: 70, mid_caution: 50, bear_rally: 35, risk_off: 10 }[bucket] : null;
  }
  const trendScore = trendSleeveScore([buckets.SPY, buckets.QQQ]);

  // ── Module 5: Volatility / Stress ────────────────────────────────────
  const spyCloses = await tdDailyCloses('SPY', twelveDataKey);
  let vix = finnhubKey ? await finnhubQuote('^VIX', finnhubKey) : null;
  const vixCloses = await tdDailyCloses('VIX', twelveDataKey);
  if (vix === null && vixCloses.length) vix = vixCloses[vixCloses.length - 1];
  const vixDelta5 = vixCloses.length >= 6 ? vixCloses[vixCloses.length - 1] - vixCloses[vixCloses.length - 6] : null;

  let vvix = finnhubKey ? await finnhubQuote('^VVIX', finnhubKey) : null;
  const vvixCloses = await tdDailyCloses('VVIX', twelveDataKey);
  if (vvix === null && vvixCloses.length) vvix = vvixCloses[vvixCloses.length - 1];

  const spyHv = hv30(spyCloses);
  const ivRatio = vix !== null && spyHv !== null && spyHv > 0 ? vix / spyHv : null;

  let vvixPctScore: number | null = null;
  if (vvix !== null) {
    if (vvixCloses.length >= 60) {
      const pct = percentileRank(vvix, vvixCloses.slice(-252));
      vvixPctScore = pct === null ? vvixScore(vvix) : 100 - pct;
    } else {
      vvixPctScore = vvixScore(vvix);
    }
  }

  const volatilityScore = volatilityStressScore([
    vixScore(vix), ivPremiumScore(ivRatio), vvixPctScore, vixDirectionScore(vixDelta5),
  ]);
  const stressRising = vixDelta5 !== null && vixDelta5 > 0;

  // ── Module 6: Credit / Liquidity ─────────────────────────────────────
  const hygCloses = await tdDailyCloses('HYG', twelveDataKey);
  const hyg50 = sma(hygCloses, 50);
  const hygNow = hygCloses[hygCloses.length - 1] ?? null;
  const hygPrev = hygCloses[hygCloses.length - 2] ?? null;
  const creditScore = hyg50 && hygNow && hygPrev ? creditHygScore(hygNow > hyg50, hygNow > hygPrev) : null;

  // ── Module 7: Rates + Dollar ──────────────────────────────────────────
  const tnxCloses = (await tdDailyCloses('TNX', twelveDataKey)).map((c) => normalizeYield(c) as number);
  const us10y = tnxCloses.length ? tnxCloses[tnxCloses.length - 1] : null;
  const us10yDelta5 = tnxCloses.length >= 6 ? tnxCloses[tnxCloses.length - 1] - tnxCloses[tnxCloses.length - 6] : null;
  const uupCloses = await tdDailyCloses('UUP', twelveDataKey, 60);
  const uup = uupCloses[uupCloses.length - 1] ?? null;
  const uup9 = sma(uupCloses, 9);
  const uup21 = sma(uupCloses, 21);
  const uupAbove9 = uup !== null && uup9 !== null ? uup > uup9 : null;
  const uupAbove21 = uup !== null && uup21 !== null ? uup > uup21 : null;
  const ratesDollarSc = ratesDollarScore([
    us10yScore(us10y, us10yDelta5, stressRising),
    uupAbove9 !== null && uupAbove21 !== null ? uupScore(uupAbove9, uupAbove21) : null,
  ]);

  // ── Module 8: GEX (from Supabase signals, written by the morning routine) ──
  let gexBias: string | null = null;
  try {
    const { data: trader } = await supabase.from('traders').select('id').eq('name', 'Graddox').single();
    if (trader) {
      const { data: signal } = await supabase
        .from('signals').select('bias').eq('trader_id', (trader as { id: string }).id)
        .order('date', { ascending: false }).limit(1).maybeSingle();
      gexBias = (signal as { bias?: string } | null)?.bias ?? null;
    }
  } catch { /* ignore — gexScore(null) below */ }
  const gexSc = gexScore(gexBias);

  // ── Module 9: Risk Appetite — Breadth sub-score only feeds indicatorScores;
  //    the full gauge needs Graddox/credit context already computed above. ──
  let breadth: number | null = null;
  const rspCloses = await tdDailyCloses('RSP', twelveDataKey);
  const L = Math.min(rspCloses.length, spyCloses.length);
  if (L >= 51) {
    const ratios = rspCloses.slice(-L).map((r, i) => r / spyCloses.slice(-L)[i]);
    const ratioNow = ratios[ratios.length - 1];
    const ratioMa50 = ratios.slice(-50).reduce((a, b) => a + b, 0) / 50;
    breadth = breadthScore(ratioNow > ratioMa50, ratioNow > ratios[ratios.length - 2]);
  }

  const regimeScore = environmentScore([
    { key: 'trend', score: trendScore },
    { key: 'volatility', score: volatilityScore },
    { key: 'credit', score: creditScore },
    { key: 'rates_dollar', score: ratesDollarSc },
    { key: 'gex', score: gexSc },
  ]);

  // ── Module 3: Event Risk overlay (reuse the deployed scraper, don't duplicate it) ──
  const eventRiskResp = await fetchEventRisk();
  const eventRiskRead = classifyEventRisk(eventRiskResp.events);

  const moduleScores = {
    regime: regimeScore,
    trend: trendScore,
    volatility: volatilityScore,
    credit: creditScore,
    rates_dollar: ratesDollarSc,
    gex: gexSc,
    risk_appetite: breadth, // partial proxy; full 7-input gauge stays client-side
  };

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('macro_daily_snapshots').upsert({
    snapshot_date: snapshotDate,
    module_scores: moduleScores,
    indicator_scores: indicatorScores,
    event_risk: { overlay: eventRiskRead.overlay, riskLevel: eventRiskRead.riskLevel, source: eventRiskResp.source },
  }, { onConflict: 'snapshot_date' });

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ snapshotDate, moduleScores }) };
};

export const handler = schedule('30 21 * * 1-5', handlerImpl);
