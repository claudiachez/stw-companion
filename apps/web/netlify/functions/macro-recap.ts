/**
 * Macro weekly recap generator.
 *
 * Produces a week-close note + next-week expectations from the macro module
 * scores and the grounding context (GEX read, trend structure, breadth, VIX).
 * The model is instructed to use ONLY the provided data — never fabricate
 * figures it wasn't given.
 *
 * Uses direct fetch() to the Anthropic API (NOT @anthropic-ai/sdk — the SDK has
 * ESM/CJS bundling issues in the Netlify Functions runtime that produce 502s;
 * see CLAUDE.md → Conventions). Prefers Sonnet for narrative quality, falls back
 * to Haiku if the key lacks access; override with MACRO_RECAP_MODEL.
 *
 * Result is upserted into `macro_weekly_recaps` (migration 049), keyed by ISO
 * week (`isoWeekKey()` from @stw/shared) — a cross-device row every user reads,
 * instead of each browser regenerating its own via localStorage. Only the editor
 * (cc@claudiachez.com) may trigger a regeneration — this is a real, costly
 * Anthropic call, so the check is a hard 403, not the best-effort warn this
 * function used to do. An optional `note` in the request body lets the editor
 * steer the angle of the rewrite (e.g. "focus more on credit stress this week");
 * it's folded into the prompt and persisted alongside the result as `admin_note`.
 *
 * Required Netlify env vars:
 *   VITE_SUPABASE_URL  (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 * Optional:
 *   MACRO_RECAP_MODEL  (defaults to claude-sonnet-4-6, then claude-haiku-4-5-20251001)
 */
import type { Handler } from '@netlify/functions';
import { isoWeekKey } from '@stw/shared';

// Use direct REST calls instead of @supabase/supabase-js to avoid the
// Realtime client's Node 20 WebSocket error (supabase-js 2.100+ throws on
// createClient when native WebSocket is absent, crashing the function).
function jwtEmail(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as Record<string, unknown>;
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
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

const EDITOR_EMAIL = 'cc@claudiachez.com';

function err(statusCode: number, message: string) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: message }) };
}

interface RecapModule { score: number | null; label: string; fiveDayDelta?: number | null }
interface LevelSet { resistance: number | null; gex1: number | null; put_support: number | null; key_target?: number | null; downside_risk?: number | null }
interface RecapRequest {
  regime: { score: number | null; label: string; tradingMode: string; fiveDayDelta?: number | null };
  modules: { trend: RecapModule; volatility: RecapModule; credit: RecapModule; ratesDollar: RecapModule; gex: RecapModule };
  context?: {
    indicators?: { symbol: string; name: string; bucket: string | null; close: number | null; chgPct: number | null }[];
    volatility?: { vix: number | null; vvix: number | null; ivPremium: number | null } | null;
    riskAppetite?: { total: number | null; inputs: { label: string; score: number | null }[] } | null;
    gex?: { bias: string; biasNote: string; lastUpdated: string; spx?: LevelSet | null; qqq?: LevelSet | null } | null;
  };
  eventRisk?: { level: string; event: string; time: string; consensus?: string; previous?: string; overlay?: string } | null;
  note?: string;
}

function moduleLine(name: string, m: RecapModule | undefined): string {
  if (!m) return `- ${name}: N/A`;
  const d = m.fiveDayDelta === null || m.fiveDayDelta === undefined ? '' : `, 5D ${m.fiveDayDelta >= 0 ? '+' : ''}${m.fiveDayDelta}`;
  return `- ${name}: ${m.score ?? 'N/A'}/100 (${m.label}${d})`;
}

function levelLine(name: string, ls: LevelSet | null | undefined): string {
  if (!ls) return '';
  const parts = [
    ls.resistance != null ? `resistance ${ls.resistance}` : '',
    ls.gex1 != null ? `gamma flip/GEX1 ${ls.gex1}` : '',
    ls.put_support != null ? `put support ${ls.put_support}` : '',
    ls.key_target != null ? `target ${ls.key_target}` : '',
    ls.downside_risk != null ? `downside ${ls.downside_risk}` : '',
  ].filter(Boolean).join(', ');
  return parts ? `  ${name}: ${parts}` : '';
}

function buildPrompt(body: RecapRequest): string {
  const { regime, modules, context, eventRisk } = body;
  const ctx = context ?? {};

  const indicatorLines = (ctx.indicators ?? [])
    .map((i) => `- ${i.symbol} (${i.name}): ${i.bucket ?? 'n/a'}${i.chgPct != null ? `, ${i.chgPct >= 0 ? '+' : ''}${i.chgPct.toFixed(2)}% on the day` : ''}`)
    .join('\n');

  const vol = ctx.volatility;
  const volLine = vol ? `VIX ${vol.vix ?? 'n/a'}, VVIX ${vol.vvix ?? 'n/a'}, IV premium ${vol.ivPremium != null ? vol.ivPremium.toFixed(2) : 'n/a'}` : 'n/a';

  const breadth = ctx.riskAppetite?.inputs?.find((x) => x.label.toLowerCase().includes('breadth'));
  const breadthLine = breadth ? `Breadth (RSP/SPY) sub-score ${breadth.score ?? 'n/a'}/100` : '';

  const gex = ctx.gex;
  const gexBlock = gex ? [
    `GEX bias: ${gex.bias || 'n/a'}`,
    gex.biasNote ? `GEX note (from the desk): "${gex.biasNote}"` : '',
    levelLine('SPX levels', gex.spx),
    levelLine('QQQ levels', gex.qqq),
  ].filter(Boolean).join('\n') : 'GEX: n/a';

  const eventLine = eventRisk
    ? `Event risk: ${eventRisk.level} — ${eventRisk.event} (${eventRisk.time})${eventRisk.consensus ? `, consensus ${eventRisk.consensus}` : ''}.`
    : 'No major scheduled event risk noted.';

  const noteBlock = body.note?.trim()
    ? `\nEDITOR GUIDANCE FOR THIS REWRITE: "${body.note.trim()}"\nWeave this angle/focus into the note while still obeying the grounding rules below — never let it justify inventing a figure you weren't given.\n`
    : '';

  return `You are a sharp markets strategist writing a WEEK-CLOSE note plus NEXT-WEEK expectations for active traders. Write in the voice of a desk strategist: confident, specific, and narrative — short punchy paragraphs, not bullet dumps.
${noteBlock}
CRITICAL GROUNDING RULES:
- Use ONLY the data provided below. Do NOT invent specific figures (dollar flows, exact streak counts, sector names, fund names) you were not given.
- You MAY interpret and tell a story (rotation, risk-on/off, where leadership sits) but every concrete number you cite must come from the data below.
- Always read across the index structure: if small caps (IWM) or equal-weight (RSP) diverge from SPY/QQQ, name the rotation explicitly (e.g. broad market vs mega-cap leadership). Work it into the prose.
- If the data is thin, write a shorter note rather than padding with invented detail.
- Quote price levels exactly as given (SPX/QQQ levels are in index points).

DATA
Market Regime: ${regime?.score ?? 'n/a'}/100 — ${regime?.label ?? 'n/a'}. Trading-mode guidance: ${regime?.tradingMode ?? 'n/a'}.
Module scores (0-100, higher = more risk-on / less stress):
${moduleLine('Trend / Structure', modules?.trend)}
${moduleLine('Volatility / Stress', modules?.volatility)}
${moduleLine('Credit / Liquidity', modules?.credit)}
${moduleLine('Rates + Dollar', modules?.ratesDollar)}
${moduleLine('GEX / Positioning', modules?.gex)}
Index structure (vs 9/21/200-day MAs):
${indicatorLines || '- n/a'}
Volatility: ${volLine}
${breadthLine}
${gexBlock}
${eventLine}

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

async function callAnthropic(apiKey: string, model: string, prompt: string): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 2500, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text()).slice(0, 300) };
  const data = await res.json() as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
  return { ok: true, text };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  const authHeader = event.headers.authorization ?? event.headers.Authorization ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const supabaseUrl  = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';

  if (!supabaseUrl || !serviceKey) return err(500, 'Server config error');
  if (!anthropicKey) return err(500, 'AI service not configured');

  // Hard gate: this triggers a real, costly Anthropic call and writes the shared
  // cross-device recap every subscriber reads, so unlike the read side, regeneration
  // is editor-only — never a best-effort warn.
  if (!token) return err(401, 'Authentication required to regenerate the recap');
  let callerEmail: string | undefined;
  callerEmail = jwtEmail(token) ?? undefined;
  if (!callerEmail) return err(401, 'Could not read session — token missing or malformed');
  if (callerEmail !== EDITOR_EMAIL) return err(403, 'Only the editor can regenerate the recap');

  let body: RecapRequest;
  try {
    body = JSON.parse(event.body ?? '{}') as RecapRequest;
  } catch {
    return err(400, 'Invalid request body');
  }

  const prompt = buildPrompt(body);

  // Prefer Sonnet for narrative quality; fall back to Haiku if the key lacks access.
  const models = [...new Set([
    process.env.MACRO_RECAP_MODEL || 'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ])];

  try {
    let lastErr = { status: 502, detail: 'no model attempted' };
    for (const model of models) {
      const r = await callAnthropic(anthropicKey, model, prompt);
      if (r.ok) {
        const m = r.text.match(/\{[\s\S]*\}/);
        if (!m) return err(500, 'Could not parse AI response');
        const recap = JSON.parse(m[0]);
        const generatedAt = new Date().toISOString();
        const upsertError = await sbUpsert(supabaseUrl, serviceKey, 'macro_weekly_recaps', {
          week_key: isoWeekKey(),
          recap,
          admin_note: body.note?.trim() || null,
          model,
          generated_at: generatedAt,
        });
        if (upsertError) console.error('macro-recap: failed to persist recap:', upsertError);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...recap, generatedAt }) };
      }
      lastErr = { status: r.status, detail: r.detail };
      // Only fall through to the next model when this one isn't available.
      if (r.status !== 404 && r.status !== 403 && r.status !== 400) break;
      console.warn(`macro-recap: model ${model} unavailable (${r.status}), trying next`);
    }
    return err(502, `Anthropic ${lastErr.status}: ${lastErr.detail}`);
  } catch (e) {
    console.error('macro-recap error:', e);
    return err(500, `AI generation failed: ${e instanceof Error ? e.message : 'unknown'}`);
  }
};
