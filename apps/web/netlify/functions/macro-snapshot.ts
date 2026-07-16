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
 *
 * Instrumentation (2026-07-05 fix, plans/integrity-guardrails.md Item 0): every
 * invocation writes a `run_log` row (run_type='macro-snapshot', ok/error status,
 * rows written, error detail) — a scheduled job going silent for days with no
 * queryable trail is exactly what happened before this fix (macro_daily_snapshots
 * sat at zero rows since migration 048 shipped). `netlify.toml` now also declares
 * an explicit `timeout` for this function (it previously had none, silently
 * falling back to Netlify's short default — implausible for ~10 sequential
 * external API round trips; every sibling scheduled function in this repo,
 * ibkr-flex/macro-recap-am/macro-recap-pm, has an explicit override). SPY and RSP
 * closes are fetched once and reused (previously fetched twice each) to shave two
 * TwelveData credits per run. `engine_version` (migration 054) is stamped on every
 * row so a stored score is attributable to the scorer code that produced it.
 */
import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import {
  trendBucket, trendSleeveScore, environmentScore,
  vixScore, ivPremiumScore, vixDirectionScore, volatilityStressScore, hv30,
  creditOasScore, us10yScore, uupScore, ratesDollarScore, breadthScore,
  classifyEventRisk, riskAppetiteScore, SLEEVE_WEIGHTS,
  buildFredUrl, parseFredObservations, runPaced, FEED_LIMITS, FRED_SERIES,
} from '@stw/shared';
import type { MacroEvent, RegimeSleeveKey } from '@stw/shared';

const TREND_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'RSP', 'VEA'];

function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  return closes.slice(-n).reduce((a, b) => a + b, 0) / n;
}

// Macro INDEX series (VIX, US10Y, credit, dollar) now come from FRED — free,
// ~120/min, authoritative — instead of TwelveData, which freed TD's 8/min budget
// for the equity trend ETFs below. Paced through the shared runPaced anyway.
async function fredCloses(seriesIds: string[], key: string): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  await runPaced(seriesIds, async (id) => {
    try {
      const res = await fetch(buildFredUrl(id, key));
      out[id] = res.ok ? parseFredObservations(await res.json()).map((b) => b.close) : [];
    } catch { out[id] = []; }
    return id;
  }, FEED_LIMITS.fred);
  return out;
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

// TwelveData bills 1 credit PER SYMBOL, not per HTTP call, and the free tier caps
// at ~8 credits/minute (CLAUDE.md → Macro data sources). This function fetches ~10
// daily series; firing them all at once 429s everything past the 8th — which is
// exactly why earlier snapshot rows landed with null trend/volatility/credit/rates
// scores. Fetch in ≤8-symbol chunks, one paced ~65s apart, mirroring maCache.ts's
// tdBatchCloses/fetchClosesChunked in the browser. The 65s gap is why netlify.toml
// gives this function an extended timeout.
const TD_CHUNK_SIZE = 8;
const TD_CHUNK_GAP_MS = 65_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pacedDailyCloses(symbols: string[], key: string): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  for (let i = 0; i < symbols.length; i += TD_CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + TD_CHUNK_SIZE);
    await Promise.all(chunk.map(async (s) => { out[s] = await tdDailyCloses(s, key); }));
    if (i + TD_CHUNK_SIZE < symbols.length) await sleep(TD_CHUNK_GAP_MS);
  }
  return out;
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

// Admin-configurable regime sleeve weights (app_config, migration 061), percent
// scale. Per-key fallback to the hardcoded defaults (×100) so the persisted
// regime matches the live banner and never breaks on a missing/unseeded row.
async function fetchRegimeWeights(url: string, key: string): Promise<Record<RegimeSleeveKey, number>> {
  const def: Record<RegimeSleeveKey, number> = {
    trend: SLEEVE_WEIGHTS.trend * 100, volatility: SLEEVE_WEIGHTS.volatility * 100,
    credit: SLEEVE_WEIGHTS.credit * 100, rates_dollar: SLEEVE_WEIGHTS.rates_dollar * 100,
    gex: SLEEVE_WEIGHTS.gex * 100,
  };
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/app_config?select=key,value&key=like.regime_weight*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) return def;
    const rows = await res.json() as { key: string; value: number }[];
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      trend: m.regime_weight_trend ?? def.trend,
      volatility: m.regime_weight_volatility ?? def.volatility,
      credit: m.regime_weight_credit ?? def.credit,
      rates_dollar: m.regime_weight_rates_dollar ?? def.rates_dollar,
      gex: m.regime_weight_gex ?? def.gex,
    };
  } catch { return def; }
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

async function sbInsert(url: string, key: string, table: string, row: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
  } catch { /* run_log is best-effort — never let a logging failure mask the real result */ }
}

// Trading-day guard — the shared market calendar (migration 068) via the
// is_trading_day RPC. Weekends are already excluded by the cron (`* 1-5`); this
// catches NYSE holidays. Fails OPEN (returns true) if the RPC is unavailable — a
// calendar outage must never silently stop writing market data.
async function isTradingDay(url: string, key: string, dateStr: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/is_trading_day`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ d: dateStr }),
    });
    if (!res.ok) return true;
    return (await res.json()) !== false;
  } catch { return true; }
}

// 2.0.0: macro indices moved to FRED (VIX/US10Y/dollar) + real HY OAS credit,
// VVIX removed — a stored score's provenance changes, so the version bumps.
const ENGINE_VERSION = 'macro-snapshot-2.0.0';

const handlerImpl: Handler = async () => {
  const twelveDataKey = (process.env.VITE_TWELVEDATA_KEY ?? process.env.TWELVEDATA_KEY ?? '').trim();
  const fredKey = (process.env.FRED_API_KEY ?? '').trim();
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }) };
  }
  if (!twelveDataKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing TWELVEDATA_KEY' }) };
  }

  const runLogBase = { run_type: 'macro-snapshot' };

  // Don't write a snapshot on a market holiday (the trajectory reader also filters
  // these, but the writer shouldn't create them in the first place).
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (!(await isTradingDay(supabaseUrl, serviceKey, todayET))) {
    await sbInsert(supabaseUrl, serviceKey, 'run_log', { ...runLogBase, status: 'ok', messages_processed: 0, summary: `skipped ${todayET} — not a trading day` });
    return { statusCode: 200, body: JSON.stringify({ skipped: todayET, reason: 'not a trading day' }) };
  }

  try {
  // ── Fetch equity trend ETFs from TwelveData (paced ≤8/65s) and the macro
  //    index series from FRED (VIX/US10Y/credit/dollar) in parallel. Splitting
  //    the indices off to FRED freed TD's 8/min budget for just these 5 ETFs. ──
  const [closesBySymbol, fredBySeries] = await Promise.all([
    pacedDailyCloses(TREND_SYMBOLS, twelveDataKey),
    fredKey
      ? fredCloses([FRED_SERIES.vix, FRED_SERIES.us10y, FRED_SERIES.hyOas, FRED_SERIES.dollar], fredKey)
      : Promise.resolve({} as Record<string, number[]>),
  ]);

  // ── Module 4: Trend / Market Structure ──────────────────────────────
  const indicatorScores: Record<string, number | null> = {};
  const buckets: Record<string, ReturnType<typeof trendBucket>> = {};
  for (const symbol of TREND_SYMBOLS) {
    const closes = closesBySymbol[symbol] ?? [];
    const close = closes[closes.length - 1] ?? null;
    const ma9 = sma(closes, 9);
    const ma21 = sma(closes, 21);
    const ma200 = sma(closes, 200);
    const bucket = trendBucket(close, ma9, ma21, ma200);
    buckets[symbol] = bucket;
    indicatorScores[symbol] = bucket ? { momentum: 90, healthy_pullback: 70, mid_caution: 50, bear_rally: 35, risk_off: 10 }[bucket] : null;
  }
  const trendScore = trendSleeveScore([buckets.SPY, buckets.QQQ]);

  // ── Module 5: Volatility / Stress ── VIX from FRED (VIXCLS); IV vs SPY HV ──
  const spyCloses = closesBySymbol.SPY ?? [];
  const vixCloses = fredBySeries[FRED_SERIES.vix] ?? [];
  const vix = vixCloses.length ? vixCloses[vixCloses.length - 1] : null;
  const vixDelta5 = vixCloses.length >= 6 ? vixCloses[vixCloses.length - 1] - vixCloses[vixCloses.length - 6] : null;

  const spyHv = hv30(spyCloses);
  const ivRatio = vix !== null && spyHv !== null && spyHv > 0 ? vix / spyHv : null;

  const vixSc = vixScore(vix);
  const ivSc = ivPremiumScore(ivRatio);
  const volatilityScore = volatilityStressScore([vixSc, ivSc, vixDirectionScore(vixDelta5)]);
  const stressRising = vixDelta5 !== null && vixDelta5 > 0;

  // ── Module 6: Credit / Liquidity ── real HY OAS spread from FRED ──────
  const oasCloses = fredBySeries[FRED_SERIES.hyOas] ?? [];
  const oas50 = sma(oasCloses, 50);
  const oasNow = oasCloses[oasCloses.length - 1] ?? null;
  const oasPrev = oasCloses[oasCloses.length - 2] ?? null;
  const creditScore = oas50 && oasNow && oasPrev ? creditOasScore(oasNow < oas50, oasNow < oasPrev) : null;

  // ── Module 7: Rates + Dollar ── FRED DGS10 (yield %, no normalize) + DTWEXBGS ──
  const tnxCloses = fredBySeries[FRED_SERIES.us10y] ?? [];
  const us10y = tnxCloses.length ? tnxCloses[tnxCloses.length - 1] : null;
  const us10yDelta5 = tnxCloses.length >= 6 ? tnxCloses[tnxCloses.length - 1] - tnxCloses[tnxCloses.length - 6] : null;
  const dollarCloses = fredBySeries[FRED_SERIES.dollar] ?? [];
  const dollar = dollarCloses[dollarCloses.length - 1] ?? null;
  const dollar9 = sma(dollarCloses, 9);
  const dollar21 = sma(dollarCloses, 21);
  const dollarAbove9 = dollar !== null && dollar9 !== null ? dollar > dollar9 : null;
  const dollarAbove21 = dollar !== null && dollar21 !== null ? dollar > dollar21 : null;
  const ratesDollarSc = ratesDollarScore([
    us10yScore(us10y, us10yDelta5, stressRising),
    dollarAbove9 !== null && dollarAbove21 !== null ? uupScore(dollarAbove9, dollarAbove21) : null,
  ]);

  // ── Module 8: GEX (from gex_snapshots, written by the gex-snapshot fn from
  //    the SPX Gamma Edge newsletter) — read the persisted sleeve score so this
  //    stored history and the live UI agree on the same number. ──
  const gexRow = await sbGet<{ sleeve_score: number | null }>(
    supabaseUrl, serviceKey, 'gex_snapshots',
    'select=sleeve_score&symbol=eq.SPX&order=snapshot_date.desc,session.desc',
  );
  const gexSc = gexRow?.sleeve_score ?? null;

  // ── Module 9: Risk Appetite gauge — same weighted inputs as
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
  const rspCloses = closesBySymbol.RSP ?? [];
  const L = Math.min(rspCloses.length, spyCloses.length);
  if (L >= 51) {
    const ratios = rspCloses.slice(-L).map((r, i) => r / spyCloses.slice(-L)[i]);
    const ratioNow = ratios[ratios.length - 1];
    const ratioMa50 = ratios.slice(-50).reduce((a, b) => a + b, 0) / 50;
    breadth = breadthScore(ratioNow > ratioMa50, ratioNow > ratios[ratios.length - 2]);
  }

  const riskAppetiteSc = riskAppetiteScore({
    momentum: momentumScore, vix: vixSc, ivPremium: ivSc,
    gex: gexSc, credit: creditScore, breadth,
  });

  const regimeWeights = await fetchRegimeWeights(supabaseUrl, serviceKey);
  const regimeScore = environmentScore([
    { key: 'trend', score: trendScore },
    { key: 'volatility', score: volatilityScore },
    { key: 'credit', score: creditScore },
    { key: 'rates_dollar', score: ratesDollarSc },
    { key: 'gex', score: gexSc },
  ], regimeWeights);

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
    engine_version: ENGINE_VERSION,
  }, 'snapshot_date');

  if (upsertError) {
    await sbInsert(supabaseUrl, serviceKey, 'run_log', {
      ...runLogBase, status: 'error', messages_processed: 0,
      summary: `upsert failed for ${snapshotDate}: ${upsertError}`,
    });
    return { statusCode: 500, body: JSON.stringify({ error: upsertError }) };
  }

  await sbInsert(supabaseUrl, serviceKey, 'run_log', {
    ...runLogBase, status: 'ok', messages_processed: 1,
    summary: `wrote snapshot for ${snapshotDate} (engine ${ENGINE_VERSION})`,
  });

  return { statusCode: 200, body: JSON.stringify({ snapshotDate, moduleScores }) };
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await sbInsert(supabaseUrl, serviceKey, 'run_log', {
      ...runLogBase, status: 'error', messages_processed: 0,
      summary: `threw before upsert: ${detail}`.slice(0, 500),
    });
    return { statusCode: 500, body: JSON.stringify({ error: detail }) };
  }
};

export const handler = schedule('30 21 * * 1-5', handlerImpl);
