/**
 * IBKR Flex Query proxy — interactive per-user sync.
 *
 * Security model: the raw Flex token never travels through the browser. The client
 * sends its Supabase JWT; this function verifies it, reads the user's stored
 * credentials via service key, calls IBKR, parses the XML, persists positions +
 * executions + NLV, then returns a summary (plus any config warnings).
 *
 * The fetch/parse/persist pipeline lives in ../_lib/flex-core.ts and is shared with
 * the nightly cron (ibkr-sync-cron.ts) and the one-time import (ibkr-import.ts).
 *
 * Required Netlify env vars: SUPABASE_URL / VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { fetchFlexReport, parseFlexReport, persistFlexResult } from '../_lib/flex-core';

function err(statusCode: number, message: string) {
  return { statusCode, body: JSON.stringify({ error: message }) };
}

export const handler: Handler = async (event) => {
  try {
    return await run(event);
  } catch (e) {
    console.error('ibkr-flex unhandled error', e);
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, `Server error: ${msg}`);
  }
};

async function run(event: Parameters<Handler>[0]) {
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  const authHeader = event.headers['authorization'] ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return err(401, 'Missing Authorization header');

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) return err(500, 'Server misconfigured');

  // Node 20 has no native WebSocket; pass 'ws' as the Realtime transport so supabase-js
  // doesn't throw at import time.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  const authResult = await admin.auth.getUser(jwt);
  const user = authResult.data?.user ?? null;
  if (authResult.error || !user) return err(401, 'Invalid or expired session');

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('ibkr_flex_token, ibkr_query_id')
    .eq('user_id', user.id)
    .single();
  if (profileErr || !profile) return err(404, 'Profile not found');
  const token = profile.ibkr_flex_token?.trim();
  const queryId = profile.ibkr_query_id?.trim();
  if (!token || !queryId) return err(400, 'IBKR credentials not configured');

  // Fetch (short poll budget — Netlify 10s limit).
  const fetched = await fetchFlexReport(token, queryId, { maxPolls: 4, pollDelayMs: 1500 });
  if (!fetched.ok || !fetched.xml) return err(fetched.status ?? 502, fetched.error ?? 'IBKR fetch failed');

  let parsed;
  try {
    parsed = parseFlexReport(fetched.xml);
  } catch {
    return err(502, 'Failed to parse IBKR response');
  }

  const syncTime = new Date().toISOString();
  let persisted;
  try {
    persisted = await persistFlexResult(admin, user.id, parsed, syncTime);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : 'DB write failed');
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      count: persisted.count,
      executions: persisted.executions,
      nlv: persisted.nlv,
      accountId: parsed.accountId,
      warnings: parsed.warnings,
      lastSyncedAt: syncTime,
      ...(persisted.count === 0 ? { message: 'No open positions found in the Flex report.' } : {}),
    }),
  };
}
