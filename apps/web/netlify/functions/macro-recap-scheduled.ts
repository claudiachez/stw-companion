/**
 * Scheduled macro weekly recap generator.
 *
 * Fires at 4:05pm ET on weekdays (21:05 UTC — correct for EST; 5:05pm ET in EDT
 * summer months, which is still after market close).
 *
 * Checks whether this ISO week already has a recap in `macro_weekly_recaps`; if
 * so, exits immediately (idempotent — safe to re-trigger). Otherwise:
 *   1. Fetches TwelveData daily closes for SPY, QQQ (trend), VIX (volatility),
 *      HYG (credit), TNX (yields, ÷10 to normalize), UUP (dollar).
 *   2. Fetches the latest GEX signal from Supabase.
 *   3. Computes sleeve scores using @stw/shared utilities.
 *   4. Generates the recap via Anthropic (Sonnet → Haiku fallback).
 *   5. Upserts into `macro_weekly_recaps` keyed by ISO week.
 *
 * Required Netlify env vars (web site):
 *   VITE_SUPABASE_URL  (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 *   VITE_TWELVEDATA_KEY
 * Optional:
 *   MACRO_RECAP_MODEL  (defaults to claude-sonnet-4-6, then claude-haiku-4-5-20251001)
 */
import { schedule } from '@netlify/functions';
import {
  trendBucket, trendSleeveScore, trendSleeveLabel,
  vixScore, volatilityStressScore, stressLabel,
  creditHygScore, creditLabel,
  us10yScore, uupScore, ratesDollarScore, ratesDollarLabel,
  gexScore, gexBiasLabel,
  environmentScore, regimeBand,
  isoWeekKey,
} from '@stw/shared';

// ── Helpers ─────────────────────────────────────────────────────────────────
// Direct REST helpers — avoid @supabase/supabase-js which throws on Node 20
// due to the Realtime client requiring native WebSocket (only in Node 22+).

async function sbSelect<T>(url: string, serviceKey: string, table: string, query: string): Promise<T | null> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const rows = await res.json() as T[];
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function sbUpsert(url: string, serviceKey: string, table: string, row: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) return (await res.text()).slice(0, 200);
  return null;
}

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

async function fetchTwelveDataCloses(symbol: string, apiKey: string, outputsize = 252): Promise<number[]> {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${outputsize}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`macro-recap-scheduled: TwelveData ${symbol} fetch failed (${res.status})`); return []; }
  const data = await res.json() as { values?: { close: string }[]; status?: string };
  if (data.status === 'error' || !data.values?.length) { console.warn(`macro-recap-scheduled: TwelveData ${symbol} returned no data`); return []; }
  // values are newest-first → reverse for chronological order
  return data.values.reverse().map((v) => parseFloat(v.close)).filter((v) => !isNaN(v));
}

// ── Prompt builder (mirrors apps/web/netlify/functions/macro-recap.ts) ──────

interface RecapModule { score: number | null; label: string }
interface LevelSet { resistance: number | null; gex1: number | null; put_support: number | null }
interface RecapBody {
  regime: { score: number | null; label: string; tradingMode: string };
  modules: { trend: RecapModule; volatility: RecapModule; credit: RecapModule; ratesDollar: RecapModule; gex: RecapModule };
  context: {
    indicators: { symbol: string; name: string; bucket: string | null; close: number | null; chgPct: number | null }[];
    volatility: { vix: number | null; vvix: null; ivPremium: null };
    gex: { bias: string; biasNote: string; lastUpdated: string; spx: LevelSet | null; qqq: LevelSet | null } | null;
  };
}

function moduleLine(name: string, m: RecapModule): string {
  return `- ${name}: ${m.score ?? 'N/A'}/100 (${m.label})`;
}

function levelLine(name: string, ls: LevelSet | null): string {
  if (!ls) return '';
  const parts = [
    ls.resistance != null ? `resistance ${ls.resistance}` : '',
    ls.gex1 != null ? `gamma flip/GEX1 ${ls.gex1}` : '',
    ls.put_support != null ? `put support ${ls.put_support}` : '',
  ].filter(Boolean).join(', ');
  return parts ? `  ${name}: ${parts}` : '';
}

function buildPrompt(body: RecapBody): string {
  const { regime, modules, context } = body;
  const indicatorLines = context.indicators
    .map((i) => `- ${i.symbol} (${i.name}): ${i.bucket ?? 'n/a'}${i.chgPct != null ? `, ${i.chgPct >= 0 ? '+' : ''}${i.chgPct.toFixed(2)}% on the day` : ''}`)
    .join('\n');
  const vol = context.volatility;
  const volLine = `VIX ${vol.vix ?? 'n/a'}, VVIX n/a, IV premium n/a`;
  const gex = context.gex;
  const gexBlock = gex ? [
    `GEX bias: ${gex.bias || 'n/a'}`,
    gex.biasNote ? `GEX note (from the desk): "${gex.biasNote}"` : '',
    levelLine('SPX levels', gex.spx),
    levelLine('QQQ levels', gex.qqq),
  ].filter(Boolean).join('\n') : 'GEX: n/a';

  return `You are a sharp markets strategist writing a WEEK-CLOSE note plus NEXT-WEEK expectations for active traders. Write in the voice of a desk strategist: confident, specific, and narrative — short punchy paragraphs, not bullet dumps.

CRITICAL GROUNDING RULES:
- Use ONLY the data provided below. Do NOT invent specific figures (dollar flows, exact streak counts, sector names, fund names) you were not given.
- You MAY interpret and tell a story (rotation, risk-on/off, where leadership sits) but every concrete number you cite must come from the data below.
- If the data is thin, write a shorter note rather than padding with invented detail.
- Quote price levels exactly as given (SPX/QQQ levels are in index points).

DATA
Market Regime: ${regime.score ?? 'n/a'}/100 — ${regime.label}. Trading-mode guidance: ${regime.tradingMode}.
Module scores (0-100, higher = more risk-on / less stress):
${moduleLine('Trend / Structure', modules.trend)}
${moduleLine('Volatility / Stress', modules.volatility)}
${moduleLine('Credit / Liquidity', modules.credit)}
${moduleLine('Rates + Dollar', modules.ratesDollar)}
${moduleLine('GEX / Positioning', modules.gex)}
Index structure (vs 9/21/200-day MAs):
${indicatorLines || '- n/a'}
Volatility: ${volLine}
${gexBlock}
No major scheduled event risk noted.

Respond with ONLY a JSON object (no markdown fences) with exactly these fields:
- headline: a punchy one-line hook capturing the week's defining theme/contradiction
- verdict: 2-4 short paragraphs (separate with \\n\\n) — the weekly read: what happened beneath the surface, what's driving it
- bigStory: 1-2 paragraphs on the single dominant theme of the week (e.g. rotation, dealer positioning, a regime shift)
- scenarios: an object { "bull": "...", "base": "...", "bear": "..." } — one tight sentence each for the week ahead
- playbook: 1-2 paragraphs on next-week expectations and how to position
- watching: one line naming the key levels to watch (use the GEX levels above), e.g. "Watch 7,435 above and 7,339 below."
- tradingMode: a short action label consistent with the regime ("Risk-On", "Selective", "Defensive", "Risk-Off")
- finalWord: a short, memorable closing line`;
}

// ── Scheduled handler ────────────────────────────────────────────────────────

const scheduledHandler = async () => {
  const supabaseUrl  = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
  const twelveKey    = process.env.VITE_TWELVEDATA_KEY ?? '';

  if (!supabaseUrl || !serviceKey || !anthropicKey || !twelveKey) {
    console.error('macro-recap-scheduled: missing required env vars — aborting');
    return;
  }

  const weekKey = isoWeekKey();

  // Idempotency check — skip if this week's recap was already generated.
  const existing = await sbSelect<{ week_key: string }>(
    supabaseUrl, serviceKey, 'macro_weekly_recaps', `select=week_key&week_key=eq.${weekKey}`,
  );

  if (existing) {
    console.log(`macro-recap-scheduled: recap for ${weekKey} already exists — skipping`);
    return;
  }

  // Fetch TwelveData closes (sequential to respect free-tier rate limits).
  console.log('macro-recap-scheduled: fetching market data from TwelveData...');
  const SYMBOLS = ['SPY', 'QQQ', 'VIX', 'HYG', 'TNX', 'UUP'];
  const closesMap: Record<string, number[]> = {};
  for (const sym of SYMBOLS) {
    closesMap[sym] = await fetchTwelveDataCloses(sym, twelveKey);
    await new Promise<void>((r) => setTimeout(r, 300));
  }

  // ── Trend sleeve (SPY + QQQ) ──
  const spyCloses = closesMap.SPY ?? [];
  const qqqCloses = closesMap.QQQ ?? [];
  const spyBucket = trendBucket(spyCloses.at(-1) ?? null, sma(spyCloses, 9), sma(spyCloses, 21), sma(spyCloses, 200));
  const qqqBucket = trendBucket(qqqCloses.at(-1) ?? null, sma(qqqCloses, 9), sma(qqqCloses, 21), sma(qqqCloses, 200));
  const trendScore = trendSleeveScore([spyBucket, qqqBucket]);

  // ── Volatility sleeve (VIX only — VVIX not available via TwelveData free tier) ──
  const vixCloses = closesMap.VIX ?? [];
  const vix = vixCloses.at(-1) ?? null;
  const volScore = volatilityStressScore([vixScore(vix)]);

  // ── Credit sleeve (HYG vs 50D MA + day direction) ──
  const hygCloses = closesMap.HYG ?? [];
  const hygLast = hygCloses.at(-1) ?? null;
  const hygMa50 = sma(hygCloses, 50);
  const hygRising = hygCloses.length >= 2 && hygCloses.at(-1)! > hygCloses.at(-2)!;
  const credScore = creditHygScore(hygLast != null && hygMa50 != null && hygLast > hygMa50, hygRising);

  // ── Rates + Dollar sleeve ──
  // TNX quotes 10× the yield (e.g. 42.5 = 4.25%) — divide to normalize.
  const tnxCloses = (closesMap.TNX ?? []).map((v) => v / 10);
  const us10y = tnxCloses.at(-1) ?? null;
  const us10yDelta5 = tnxCloses.length >= 6 ? (tnxCloses.at(-1)! - tnxCloses.at(-6)!) : null;
  const stressRising = volScore !== null && volScore < 40;
  const uupCloses = closesMap.UUP ?? [];
  const uupLast = uupCloses.at(-1) ?? null;
  const uupAbove9  = uupLast != null && sma(uupCloses, 9)  != null && uupLast > sma(uupCloses, 9)!;
  const uupAbove21 = uupLast != null && sma(uupCloses, 21) != null && uupLast > sma(uupCloses, 21)!;
  const ratesScore = ratesDollarScore([us10yScore(us10y, us10yDelta5, stressRising), uupScore(uupAbove9, uupAbove21)]);

  // ── GEX from Supabase signals ──
  const signalRow = await sbSelect<{ bias: string; bias_note: string; spx: unknown; qqq: unknown; last_updated: string }>(
    supabaseUrl, serviceKey, 'signals', 'select=bias,bias_note,spx,qqq,last_updated&order=date.desc',
  );

  const gexBias = signalRow?.bias ?? null;
  const gexScoreVal = gexScore(gexBias);

  // ── Environment score + regime ──
  const envScore = environmentScore([
    { key: 'trend',       score: trendScore  },
    { key: 'volatility',  score: volScore    },
    { key: 'credit',      score: credScore   },
    { key: 'ratesDollar', score: ratesScore  },
    { key: 'gex',         score: gexScoreVal },
  ]);

  if (envScore === null) {
    console.error('macro-recap-scheduled: insufficient data to compute environment score — aborting');
    return;
  }

  const regime = regimeBand(envScore);

  // ── Build prompt body ──
  const spyChg = spyCloses.length >= 2 ? ((spyCloses.at(-1)! / spyCloses.at(-2)!) - 1) * 100 : null;
  const qqqChg = qqqCloses.length >= 2 ? ((qqqCloses.at(-1)! / qqqCloses.at(-2)!) - 1) * 100 : null;

  const body: RecapBody = {
    regime: { score: regime.score, label: regime.label, tradingMode: regime.tradingMode },
    modules: {
      trend:       { score: trendScore,  label: trendSleeveLabel(trendScore)   },
      volatility:  { score: volScore,    label: stressLabel(volScore)           },
      credit:      { score: credScore,   label: creditLabel(credScore)          },
      ratesDollar: { score: ratesScore,  label: ratesDollarLabel(ratesScore)   },
      gex:         { score: gexScoreVal, label: gexBiasLabel(gexBias)          },
    },
    context: {
      indicators: [
        { symbol: 'SPY', name: 'S&P 500',     bucket: spyBucket, close: spyCloses.at(-1) ?? null, chgPct: spyChg },
        { symbol: 'QQQ', name: 'Nasdaq 100',  bucket: qqqBucket, close: qqqCloses.at(-1) ?? null, chgPct: qqqChg },
      ],
      volatility: { vix, vvix: null, ivPremium: null },
      gex: signalRow ? {
        bias:        signalRow.bias ?? '',
        biasNote:    signalRow.bias_note ?? '',
        lastUpdated: signalRow.last_updated ?? '',
        spx:         (signalRow.spx as LevelSet | null) ?? null,
        qqq:         (signalRow.qqq as LevelSet | null) ?? null,
      } : null,
    },
  };

  const prompt = buildPrompt(body);

  // ── Call Anthropic (Sonnet → Haiku fallback) ──
  const models = [...new Set([
    process.env.MACRO_RECAP_MODEL || 'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ])];

  for (const model of models) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 2500, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      console.warn(`macro-recap-scheduled: model ${model} failed (${res.status}): ${detail}`);
      if (res.status !== 404 && res.status !== 403 && res.status !== 400) break;
      continue;
    }

    const aiData = await res.json() as { content?: { type: string; text?: string }[] };
    const text = aiData.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { console.error('macro-recap-scheduled: could not parse AI response JSON'); return; }

    let recap: unknown;
    try {
      recap = JSON.parse(match[0]);
    } catch (e) {
      console.error('macro-recap-scheduled: JSON parse error:', e);
      return;
    }

    const generatedAt = new Date().toISOString();
    const upsertError = await sbUpsert(supabaseUrl, serviceKey, 'macro_weekly_recaps', {
      week_key: weekKey, recap, model, generated_at: generatedAt,
    });

    if (upsertError) {
      console.error('macro-recap-scheduled: upsert failed:', upsertError);
    } else {
      console.log(`macro-recap-scheduled: recap for ${weekKey} generated and persisted (${model})`);
    }
    return;
  }

  console.error('macro-recap-scheduled: all models failed — no recap generated');
};

// Netlify scheduled function: 4:05pm ET weekdays.
// Cron runs in UTC: 21:05 UTC = 4:05pm EST (correct in winter); in summer EDT
// (UTC-4) this fires at 5:05pm ET — still after 4pm market close.
export const handler = schedule('5 21 * * 1-5', scheduledHandler);
