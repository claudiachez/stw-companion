/**
 * Macro recap generator.
 *
 * Security: client sends Supabase JWT → verified here. Then calls Claude
 * haiku to generate a brief market environment recap based on indicator data.
 *
 * Required Netlify env vars:
 *   VITE_SUPABASE_URL  (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 */
import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

function err(statusCode: number, message: string) {
  return { statusCode, body: JSON.stringify({ error: message }) };
}

interface IndicatorSummary {
  symbol: string;
  name: string;
  close: number | null;
  signal: string;
  tier: string | null;
}

interface RecapRequest {
  indicators: IndicatorSummary[];
  graddoxBias: string;
  graddoxBiasNote: string;
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
    const supabase = createClient(supabaseUrl, serviceKey);
    const { error: authError } = await supabase.auth.getUser(token);
    if (authError) return err(401, 'Unauthorized');
  }

  // ── Parse body ─────────────────────────────────────────
  let body: RecapRequest;
  try {
    body = JSON.parse(event.body ?? '{}') as RecapRequest;
  } catch {
    return err(400, 'Invalid request body');
  }

  const { indicators, graddoxBias, graddoxBiasNote } = body;

  // ── Build prompt ───────────────────────────────────────
  const indLines = (indicators ?? []).map((i) =>
    `${i.symbol} (${i.name}): close=${i.close ?? 'N/A'}, signal=${i.signal}, tier=${i.tier ?? 'N/A'}`
  ).join('\n');

  const prompt = `You are a concise market analyst. Based on the following indicator data, write a brief environment read.

Indicators:
${indLines}

GEX Bias: ${graddoxBias || 'N/A'}
GEX Note: ${graddoxBiasNote || 'N/A'}

Respond with a JSON object with exactly these fields:
- summary: 2-3 sentences describing the current market environment
- keyLevel: the most important price level to watch (number, or null if unclear)
- keyLevelNote: one short phrase explaining why that level matters
- bottomLine: one sentence bottom line for subscribers

Return only the JSON object, no other text.`;

  // ── Call Claude haiku ──────────────────────────────────
  try {
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') return err(500, 'Unexpected response format');

    // Parse the JSON response
    const text = content.text.trim();
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
    return err(500, 'AI generation failed');
  }
};
