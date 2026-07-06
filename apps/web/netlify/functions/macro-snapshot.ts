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
 * Env vars: reuses the site's existing VITE_FINNHUB_KEY / VITE_TWELVEDATA_KEY /
 * VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — no new Netlify env vars needed.
 * The VITE_ prefix only controls what Vite inlines into the CLIENT bundle at
 * build time; it has no effect on a Function's runtime process.env, which gets
 * every site env var regardless of name (same fallback pattern already used in
 * ibkr-flex.ts / macro-recap.ts: `process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL`).
 *
 * Event risk is fetched from the already-deployed macro-events function
 * (internal HTTP call via process.env.URL) rather than duplicating its
 * MarketWatch scrape here.
 */
import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import {
  trendBucket, trendSleeveScore, environmentScore,
  vixScore, vvixScore, ivPremiumScore, vixDirectionScore, volatilityStressScore, percentileRank, hv30,
  creditHygScore, us10yScore, uupScore, ratesDollarScore, gexScore, breadthScore,
  classifyEventRisk, riskAppetiteScore,
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

async function sbGet<T>(url: string, key: string, table: string, query: string): Promise<T | null> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?${query}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const rows = await res.json() as T[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch { return null; }
}

async function sbUpsert(url: string, key: string, table: string, row: Record<string, unknown>, onConflict: string): Promise<string | null> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) return (await res.text()).slice(0, 200);
  return null;
}

const handlerImpl: Handler = async () => {
  const finnhubKey = (process.env.VITE_FINNHUB_KEY ?? process.env.FINNHUB_KEY ?? '').trim();
  const twelveDataKey = (process.env.VITE_TWELVEDATA_KEY ?? process.env.TWELVEDATA_KEY ?? '').trim();
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }) };
  }
  if (!twelveDataKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing TWELVEDATA_KEY' }) };
  }

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

  const vixSc = vixScore(vix);
  const ivSc = ivPremiumScore(ivRatio);
  const volatilityScore = volatilityStressScore([vixSc, ivSc, vvixPctScore, vixDirectionScore(vixDelta5)]);
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
    const trader = await sbGet<{ id: string }>(supabaseUrl, serviceKey, 'traders', 'select=id&name=eq.Graddox');
    if (trader?.id) {
      const signal = await sbGet<{ bias: string }>(supabaseUrl, serviceKey, 'signals', `select=bias&trader_id=eq.${trader.id}&order=date.desc`);
      gexBias = signal?.bias ?? null;
    }
  } catch { /* ignore — gexScore(null) below */ }
  const gexSc = gexScore(gexBias);

  // ── Module 9: Risk Appetite gauge — same 7 weighted inputs as
  //    useSentimentGauge.ts, via the shared riskAppetiteScore() so the
  //    persisted trend tracks the same number the gauge displays. ──
  const spy125 = sma(spyCloses, 125);
  const spyClose = spyCloses[spyCloses.length - 1] ?? null;
  let momentumScore: number | null = null;
  if (spy125 && spyClose) {
    const pct = ((spyClose - spy125) / spy125) * 100;
    momentumScore = Math.max(0, Math.min(100, 50 + pct * 5));
  }

  let breadth: number | null = null;
  const rspCloses = await tdDailyCloses('RSP', twelveDataKey);
  const L = Math.min(rspCloses.length, spyCloses.length);
  if (L >= 51) {
    const ratios = rspCloses.slice(-L).map((r, i) => r / spyCloses.slice(-L)[i]);
    const ratioNow = ratios[ratios.length - 1];
    const ratioMa50 = ratios.slice(-50).reduce((a, b) => a + b, 0) / 50;
    breadth = breadthScore(ratioNow > ratioMa50, ratioNow > ratios[ratios.length - 2]);
  }

  const riskAppetiteSc = riskAppetiteScore({
    momentum: momentumScore, vix: vixSc, ivPremium: ivSc, vvix: vvixPctScore,
    gex: gexSc, credit: creditScore, breadth,
  });

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
    risk_appetite: riskAppetiteSc,
  };

  const snapshotDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const upsertError = await sbUpsert(supabaseUrl, serviceKey, 'macro_daily_snapshots', {
    snapshot_date: snapshotDate,
    module_scores: moduleScores,
    indicator_scores: indicatorScores,
    event_risk: { overlay: eventRiskRead.overlay, riskLevel: eventRiskRead.riskLevel, source: eventRiskResp.source },
  }, 'snapshot_date');

  if (upsertError) {
    return { statusCode: 500, body: JSON.stringify({ error: upsertError }) };
  }

  return { statusCode: 200, body: JSON.stringify({ snapshotDate, moduleScores }) };
};

export const handler = schedule('30 21 * * 1-5', handlerImpl);
