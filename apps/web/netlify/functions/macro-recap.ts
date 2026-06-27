/**
 * Macro recap generator.
 *
 * Security: client sends Supabase JWT → verified here. Then calls Claude to
 * generate a brief regime recap + trading mode from the module scores.
 *
 * Uses direct fetch() to the Anthropic API (NOT @anthropic-ai/sdk — the SDK has
 * ESM/CJS bundling issues in the Netlify Functions runtime that produce 502s;
 * see CLAUDE.md → Conventions).
 *
 * Required Netlify env vars:
 *   VITE_SUPABASE_URL  (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 */
import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

function err(statusCode: number, message: string) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: message }) };
}

interface RecapModule { score: number | null; label: string; fiveDayDelta?: number | null }
interface RecapRequest {
  regime: { score: number | null; label: string; tradingMode: string; fiveDayDelta?: number | null };
  modules: {
    trend: RecapModule; volatility: RecapModule; credit: RecapModule;
    ratesDollar: RecapModule; gex: RecapModule;
  };
  eventRisk?: { level: string; event: string; time: string; consensus?: string; previous?: string; overlay?: string } | null;
}

function moduleLine(name: string, m: RecapModule | undefined): string {
  if (!m) return `${name}: N/A`;
  const d = m.fiveDayDelta === null || m.fiveDayDelta === undefined ? '' : `, 5D ${m.fiveDayDelta >= 0 ? '+' : ''}${m.fiveDayDelta}`;
  return `${name}: ${m.score ?? 'N/A'} (${m.label}${d})`;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  // ── JWT auth ────────────────────────────────────────────
  const authHeader = event.headers.authorization ?? event.headers.Authorization ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const supabaseUrl  = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';

  if (!supabaseUrl || !serviceKey) return err(500, 'Server config error');
  if (!anthropicKey) return err(500, 'AI service not configured');

  if (token) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { error: authError } = await supabase.auth.getUser(token);
      if (authError) return err(401, 'Unauthorized');
    } catch (e) {
      console.error('macro-recap auth error:', e);
      return err(401, 'Auth check failed');
    }
  }

  // ── Parse body ─────────────────────────────────────────
  let body: RecapRequest;
  try {
    body = JSON.parse(event.body ?? '{}') as RecapRequest;
  } catch {
    return err(400, 'Invalid request body');
  }

  const { regime, modules, eventRisk } = body;

  // ── Build prompt ───────────────────────────────────────
  const regimeDelta = regime?.fiveDayDelta === null || regime?.fiveDayDelta === undefined
    ? '' : `, 5D ${regime.fiveDayDelta >= 0 ? '+' : ''}${regime.fiveDayDelta}`;

  const eventLine = eventRisk
    ? `Event risk: ${eventRisk.level} — ${eventRisk.event} (${eventRisk.time})${eventRisk.consensus ? `, consensus ${eventRisk.consensus}` : ''}${eventRisk.previous ? `, previous ${eventRisk.previous}` : ''}.`
    : 'Event risk: none scheduled in the near term.';

  const prompt = `You are a concise market analyst writing for active traders. Use the weighted module scores below (0-100, higher = more risk-on / less stress) to write a brief regime read. Do not invent data.

Market Regime: ${regime?.score ?? 'N/A'} — ${regime?.label ?? 'N/A'}${regimeDelta}
Trading mode guidance: ${regime?.tradingMode ?? 'N/A'}

Module scores:
- ${moduleLine('Trend / Structure', modules?.trend)}
- ${moduleLine('Volatility / Stress', modules?.volatility)}
- ${moduleLine('Credit / Liquidity', modules?.credit)}
- ${moduleLine('Rates + Dollar', modules?.ratesDollar)}
- ${moduleLine('GEX / Positioning', modules?.gex)}
${eventLine}

Respond with a JSON object with exactly these fields:
- summary: 2-3 sentences describing the current regime and what's driving it
- whatChanged: one sentence on the 5D acceleration or reversal (or "Little change over the past week." if no deltas)
- eventRisk: one sentence if event risk is active, else an empty string ""
- keyLevel: the most important price level to watch (number, or null if unclear)
- keyLevelNote: one short phrase explaining why that level matters
- tradingMode: a short action label consistent with the regime (e.g. "Risk-On", "Selective", "Defensive", "Risk-Off")
- bottomLine: one sentence bottom line for subscribers

Return only the JSON object, no other text.`;

  // ── Call Claude via direct fetch ───────────────────────
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error('Anthropic API error:', res.status, detail);
      return err(502, `Anthropic ${res.status}: ${detail}`);
    }

    const data = await res.json() as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return err(500, 'Could not parse AI response');

    const result = JSON.parse(jsonMatch[0]);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (e) {
    console.error('macro-recap error:', e);
    return err(500, `AI generation failed: ${e instanceof Error ? e.message : 'unknown'}`);
  }
};
