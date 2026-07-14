/**
 * Shared logic for the two scheduled macro recap functions (AM + PM).
 * Lives outside netlify/functions/ so Netlify doesn't deploy it as a standalone
 * function — it's bundled into each caller by esbuild at deploy time.
 */
import {
  trendBucket, trendSleeveScore, trendSleeveLabel,
  vixScore, volatilityStressScore, stressLabel,
  creditHygScore, creditLabel,
  us10yScore, uupScore, ratesDollarScore, ratesDollarLabel,
  gexScore, gexBiasLabel,
  environmentScore, regimeBand,
} from '@stw/shared';

// ── Supabase REST helpers (no supabase-js — it throws on Node 20 due to Realtime WebSocket) ──

async function sbSelect<T>(url: string, serviceKey: string, table: string, query: string): Promise<T | null> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?${query}&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const rows = await res.json() as T[];
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function sbUpsert(url: string, serviceKey: string, table: string, row: Record<string, unknown>, onConflict?: string): Promise<string | null> {
  const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}${qs}`, {
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

// ── TwelveData ───────────────────────────────────────────────────────────────

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

async function fetchCloses(symbol: string, apiKey: string): Promise<number[]> {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=252&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`recap-core: TwelveData ${symbol} failed (${res.status})`); return []; }
  const data = await res.json() as { values?: { close: string }[]; status?: string };
  if (data.status === 'error' || !data.values?.length) { console.warn(`recap-core: TwelveData ${symbol} no data`); return []; }
  return data.values.reverse().map((v) => parseFloat(v.close)).filter((v) => !isNaN(v));
}

/** Today's date in ET as YYYY-MM-DD (used as the daily recap key). */
function todayEt(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
}

// ── Catalysts (scheduled economic releases) ────────────────────────────────────
// Grounds the recap in the REAL upcoming FRED calendar so the note can speak to
// imminent catalysts (size discipline into CPI, etc.) without fabrication. Fetched
// from the already-deployed macro-events function — same no-duplication pattern as
// macro-snapshot's fetchEventRisk (process.env.URL is the Netlify site URL at runtime).

interface CatalystRow { eventName: string; releaseTimeEt: string; importance: string; actual: string | null; previous: string | null }

/** Minutes since ET midnight, e.g. 8:35am → 515. Drives the AM release gate. */
function etMinutesNow(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === 'hour')!.value, 10) % 24;
  const m = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
  return h * 60 + m;
}

/** Compact ET stamp for a catalyst line, e.g. "Jul 14 · 8:30 AM ET". */
function catalystStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
}

/** Upcoming scheduled releases in the next 7 days (soonest-first, capped). */
async function fetchCatalysts(): Promise<CatalystRow[]> {
  const base = (process.env.URL ?? process.env.DEPLOY_URL ?? '').trim();
  if (!base) return [];
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/.netlify/functions/macro-events`);
    if (!res.ok) return [];
    const d = await res.json() as { events?: CatalystRow[] };
    const cutoff = Date.now() + 7 * 86_400_000;
    return (d.events ?? [])
      .filter((e) => { const t = new Date(e.releaseTimeEt).getTime(); return !Number.isNaN(t) && t >= Date.now() - 86_400_000 && t <= cutoff; })
      .slice(0, 8);
  } catch { return []; }
}

/** Prompt block: recently-released prints (with the actual number) + upcoming
 *  catalysts — all real FRED data, never invented. */
function catalystBlock(rows: CatalystRow[]): string {
  if (!rows.length) return 'Economic calendar: nothing released or scheduled in the ±window.';
  const nowMs = Date.now();
  const lines = rows.map((e) => {
    const impact = e.importance.replace('_', ' ');
    const released = new Date(e.releaseTimeEt).getTime() <= nowMs;
    if (released) {
      // Just-released: lead with the ACTUAL print (the number the host wants to see).
      const val = e.actual ? `actual ${e.actual}${e.previous ? `, prev ${e.previous}` : ''}` : 'print pending';
      return `- ${catalystStamp(e.releaseTimeEt)} — ${e.eventName} (${impact} impact): RELEASED — ${val}`;
    }
    return `- ${catalystStamp(e.releaseTimeEt)} — ${e.eventName} (${impact} impact): due${e.previous ? `, previous ${e.previous}` : ''}`;
  }).join('\n');
  return `Economic calendar (real, from FRED — recently released prints + upcoming catalysts; factor imminent high-impact ones into the read, and speak to any just-released number):\n${lines}`;
}

// ── Prompt builders ────────────────────────────────────────────────────────────

interface RecapModule { score: number | null; label: string }
interface LevelSet { resistance: number | null; gex1: number | null; put_support: number | null }
interface RecapBody {
  regime: { score: number | null; label: string; tradingMode: string };
  modules: { trend: RecapModule; volatility: RecapModule; credit: RecapModule; ratesDollar: RecapModule; gex: RecapModule };
  context: {
    indicators: { symbol: string; name: string; bucket: string | null; close: number | null; chgPct: number | null }[];
    volatility: { vix: number | null; ivPremium: null };
    gex: { bias: string; biasNote: string; lastUpdated: string; spx: LevelSet | null; qqq: LevelSet | null } | null;
  };
  catalysts: CatalystRow[];
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

function buildAmPrompt(body: RecapBody): string {
  const { regime, modules, context, catalysts } = body;
  const indicatorLines = context.indicators
    .map((i) => `- ${i.symbol} (${i.name}): ${i.bucket ?? 'n/a'}${i.chgPct != null ? `, ${i.chgPct >= 0 ? '+' : ''}${i.chgPct.toFixed(2)}% yesterday` : ''}`)
    .join('\n');
  const gex = context.gex;
  const gexBlock = gex ? [
    `GEX bias: ${gex.bias || 'n/a'}`,
    gex.biasNote ? `GEX note (from the desk): "${gex.biasNote}"` : '',
    levelLine('SPX levels', gex.spx),
    levelLine('QQQ levels', gex.qqq),
  ].filter(Boolean).join('\n') : 'GEX: n/a';

  return `You are a sharp markets strategist writing a PRE-MARKET note for active traders — what to watch and how to think about today's session before the open.

CRITICAL GROUNDING RULES:
- Use ONLY the data provided below. Do NOT invent specific figures (dollar flows, exact streak counts, sector names, fund names) you were not given.
- You MAY interpret and tell a story but every concrete number you cite must come from the data below.
- If the data is thin, write a shorter note rather than padding with invented detail.
- Quote price levels exactly as given (SPX/QQQ levels are in index points).
- This is a MORNING note — frame it as "what to watch today" and "how to set up", not a recap of what happened.
- ECONOMIC CALENDAR: the list below is real FRED data. A "RELEASED" line already carries today's ACTUAL print — lead the read with it where it's high-impact (e.g. what a hot/cool CPI means for the session). A "due" line is upcoming — factor imminent high-impact ones into the setup (size discipline into the print). The only known numbers are the actual + previous shown; NEVER invent a consensus/expectation or predict an unreleased number.

NO REPETITION — each field has a DISTINCT job. Do not restate the same point, phrase, or number in more than one field. If two fields would say the same thing, cut one down to its unique angle. Price levels appear ONLY in "watching". "verdict" describes the setup; "playbook" prescribes actions — keep those two from overlapping.

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
VIX ${context.volatility.vix ?? 'n/a'}
${gexBlock}
${catalystBlock(catalysts)}

Respond with ONLY a JSON object (no markdown fences) with exactly these fields:
- headline: ONE line — the single theme/hook for today. No price levels, no numbers.
- verdict: 2-3 short paragraphs (separate with \\n\\n) — the READ: what the structure and positioning are telling you heading into the session, and WHY. Describe the setup; do NOT list levels or prescribe actions here.
- bigStory: 1 paragraph on the single most important thing for today — a DIFFERENT angle than the verdict (a specific catalyst, a cross-asset tell, or a positioning fact), not a restatement of it.
- scenarios: an object { "bull": "...", "base": "...", "bear": "..." } — one tight sentence each, three genuinely DISTINCT paths for today (up / chop / down), no overlap between them.
- playbook: 1-2 paragraphs of ACTIONS only — what setups to take, how to size, what to avoid, when to wait. Not market description (that is the verdict's job).
- watching: one line naming the key levels that decide today's tone, e.g. "Hold above 5,435 = bulls in control; lose it and 5,339 is next." Levels appear ONLY here.
- tradingMode: a short action label consistent with the regime ("Risk-On", "Selective", "Defensive", "Risk-Off")
- finalWord: ONE short, memorable discipline/mindset line to carry into the session — NOT a restatement of the headline or verdict.`;
}

function buildPmPrompt(body: RecapBody): string {
  const { regime, modules, context, catalysts } = body;
  const indicatorLines = context.indicators
    .map((i) => `- ${i.symbol} (${i.name}): ${i.bucket ?? 'n/a'}${i.chgPct != null ? `, ${i.chgPct >= 0 ? '+' : ''}${i.chgPct.toFixed(2)}% on the day` : ''}`)
    .join('\n');
  const gex = context.gex;
  const gexBlock = gex ? [
    `GEX bias: ${gex.bias || 'n/a'}`,
    gex.biasNote ? `GEX note (from the desk): "${gex.biasNote}"` : '',
    levelLine('SPX levels', gex.spx),
    levelLine('QQQ levels', gex.qqq),
  ].filter(Boolean).join('\n') : 'GEX: n/a';

  return `You are a sharp markets strategist writing a POST-MARKET recap for active traders — what happened today and what it means for tomorrow's setup.

CRITICAL GROUNDING RULES:
- Use ONLY the data provided below. Do NOT invent specific figures (dollar flows, exact streak counts, sector names, fund names) you were not given.
- You MAY interpret and tell a story but every concrete number you cite must come from the data below.
- If the data is thin, write a shorter note rather than padding with invented detail.
- Quote price levels exactly as given (SPX/QQQ levels are in index points).
- This is an EVENING note — frame it as "what happened" and "what to set up for tomorrow".
- ECONOMIC CALENDAR: the list below is real FRED data. A "RELEASED" line carries today's ACTUAL print — speak to any high-impact one that dropped. A "due" line is upcoming — factor imminent high-impact ones into tomorrow's setup (size discipline into the print). The only known numbers are the actual + previous shown; NEVER invent a consensus/expectation or predict an unreleased number.

NO REPETITION — each field has a DISTINCT job. Do not restate the same point, phrase, or number in more than one field. If two fields would say the same thing, cut one down to its unique angle. Price levels appear ONLY in "watching". "verdict" explains what happened; "playbook" prescribes tomorrow's actions — keep those two from overlapping.

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
VIX ${context.volatility.vix ?? 'n/a'}
${gexBlock}
${catalystBlock(catalysts)}

Respond with ONLY a JSON object (no markdown fences) with exactly these fields:
- headline: ONE line capturing today's defining theme or move. No price levels, no numbers.
- verdict: 2-3 short paragraphs (separate with \\n\\n) — what happened beneath the surface and what's driving it. Explain the session; do NOT list levels or prescribe tomorrow's actions here.
- bigStory: 1 paragraph on the single dominant theme of the session (rotation, VIX move, dealer positioning, etc.) — a DIFFERENT angle than the verdict, not a restatement.
- scenarios: an object { "bull": "...", "base": "...", "bear": "..." } — one tight sentence each, three genuinely DISTINCT paths for tomorrow, no overlap between them.
- playbook: 1-2 paragraphs of ACTIONS only for the next session — what to press, what to cut, how to position overnight. Not a recap (that is the verdict's job).
- watching: one line naming the key levels for tomorrow, e.g. "Watch 5,435 above and 5,339 below." Levels appear ONLY here.
- tradingMode: a short action label consistent with the regime ("Risk-On", "Selective", "Defensive", "Risk-Off")
- finalWord: ONE short, memorable discipline/mindset closing line — NOT a restatement of the headline or verdict.`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateDailyRecap(
  tag: string,
  session: 'am' | 'pm',
  opts: { minEtMinutes?: number } = {},
): Promise<void> {
  const supabaseUrl  = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey   = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  const twelveKey    = (process.env.VITE_TWELVEDATA_KEY ?? '').trim();

  if (!supabaseUrl || !serviceKey || !anthropicKey || !twelveKey) {
    console.error(`${tag}: missing required env vars — aborting`);
    return;
  }

  // Release gate: the AM run fires at two UTC times (12:35 + 13:35) to bracket 8:35 ET
  // across DST (Netlify cron is UTC-only). Write only once it's ≥ the gate minute in ET,
  // so the recap lands AFTER the 8:30 econ releases and can report them; idempotency
  // makes the earlier/later duplicate fire a no-op.
  if (opts.minEtMinutes != null && etMinutesNow() < opts.minEtMinutes) {
    console.log(`${tag}: ${etMinutesNow()}min ET < gate ${opts.minEtMinutes} — deferring to the later fire`);
    return;
  }

  const date = todayEt();

  // Idempotency — skip if today's session recap already exists.
  const existing = await sbSelect<{ date: string }>(
    supabaseUrl, serviceKey, 'macro_daily_recaps', `select=date&date=eq.${date}&session=eq.${session}`,
  );
  if (existing) {
    console.log(`${tag}: recap for ${date}/${session} already exists — skipping`);
    return;
  }

  // Fetch TwelveData closes sequentially (free-tier rate limit).
  console.log(`${tag}: fetching market data for ${date} ${session}...`);
  const SYMBOLS = ['SPY', 'QQQ', 'VIX', 'HYG', 'TNX', 'UUP'];
  const closesMap: Record<string, number[]> = {};
  for (const sym of SYMBOLS) {
    closesMap[sym] = await fetchCloses(sym, twelveKey);
    await new Promise<void>((r) => setTimeout(r, 300));
  }

  const spyCloses = closesMap.SPY ?? [];
  const qqqCloses = closesMap.QQQ ?? [];
  const spyBucket = trendBucket(spyCloses.at(-1) ?? null, sma(spyCloses, 9), sma(spyCloses, 21), sma(spyCloses, 200));
  const qqqBucket = trendBucket(qqqCloses.at(-1) ?? null, sma(qqqCloses, 9), sma(qqqCloses, 21), sma(qqqCloses, 200));
  const trendScore = trendSleeveScore([spyBucket, qqqBucket]);

  const vixCloses = closesMap.VIX ?? [];
  const vix = vixCloses.at(-1) ?? null;
  const volScore = volatilityStressScore([vixScore(vix)]);

  const hygCloses = closesMap.HYG ?? [];
  const hygLast = hygCloses.at(-1) ?? null;
  const hygMa50 = sma(hygCloses, 50);
  const hygRising = hygCloses.length >= 2 && hygCloses.at(-1)! > hygCloses.at(-2)!;
  const credScore = creditHygScore(hygLast != null && hygMa50 != null && hygLast > hygMa50, hygRising);

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

  const signalRow = await sbSelect<{ bias: string; bias_note: string; spx: unknown; qqq: unknown; last_updated: string }>(
    supabaseUrl, serviceKey, 'signals', 'select=bias,bias_note,spx,qqq,last_updated&order=date.desc',
  );
  const gexBias = signalRow?.bias ?? null;
  const gexScoreVal = gexScore(gexBias);

  const envScore = environmentScore([
    { key: 'trend',       score: trendScore  },
    { key: 'volatility',  score: volScore    },
    { key: 'credit',      score: credScore   },
    { key: 'ratesDollar', score: ratesScore  },
    { key: 'gex',         score: gexScoreVal },
  ]);

  if (envScore === null) {
    console.error(`${tag}: insufficient data to compute environment score — aborting`);
    return;
  }

  const regime = regimeBand(envScore);
  const spyChg = spyCloses.length >= 2 ? ((spyCloses.at(-1)! / spyCloses.at(-2)!) - 1) * 100 : null;
  const qqqChg = qqqCloses.length >= 2 ? ((qqqCloses.at(-1)! / qqqCloses.at(-2)!) - 1) * 100 : null;
  const catalysts = await fetchCatalysts();

  const body: RecapBody = {
    regime: { score: regime.score, label: regime.label, tradingMode: regime.tradingMode },
    modules: {
      trend:       { score: trendScore,  label: trendSleeveLabel(trendScore)  },
      volatility:  { score: volScore,    label: stressLabel(volScore)          },
      credit:      { score: credScore,   label: creditLabel(credScore)         },
      ratesDollar: { score: ratesScore,  label: ratesDollarLabel(ratesScore)  },
      gex:         { score: gexScoreVal, label: gexBiasLabel(gexBias)         },
    },
    context: {
      indicators: [
        { symbol: 'SPY', name: 'S&P 500',    bucket: spyBucket, close: spyCloses.at(-1) ?? null, chgPct: spyChg },
        { symbol: 'QQQ', name: 'Nasdaq 100', bucket: qqqBucket, close: qqqCloses.at(-1) ?? null, chgPct: qqqChg },
      ],
      volatility: { vix, ivPremium: null },
      gex: signalRow ? {
        bias:        signalRow.bias ?? '',
        biasNote:    signalRow.bias_note ?? '',
        lastUpdated: signalRow.last_updated ?? '',
        spx:         (signalRow.spx as LevelSet | null) ?? null,
        qqq:         (signalRow.qqq as LevelSet | null) ?? null,
      } : null,
    },
    catalysts,
  };

  const prompt = session === 'am' ? buildAmPrompt(body) : buildPmPrompt(body);

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
      console.warn(`${tag}: model ${model} failed (${res.status}): ${detail}`);
      if (res.status !== 404 && res.status !== 403 && res.status !== 400) break;
      continue;
    }

    const aiData = await res.json() as { content?: { type: string; text?: string }[] };
    const text = aiData.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { console.error(`${tag}: could not parse AI response JSON`); return; }

    let recap: unknown;
    try { recap = JSON.parse(match[0]); } catch (e) { console.error(`${tag}: JSON parse error:`, e); return; }

    const generatedAt = new Date().toISOString();
    const upsertError = await sbUpsert(supabaseUrl, serviceKey, 'macro_daily_recaps', {
      date, session, recap, model, generated_at: generatedAt,
    }, 'date,session');

    if (upsertError) console.error(`${tag}: upsert failed:`, upsertError);
    else console.log(`${tag}: ${session.toUpperCase()} recap for ${date} generated (${model})`);
    return;
  }

  console.error(`${tag}: all models failed`);
}
