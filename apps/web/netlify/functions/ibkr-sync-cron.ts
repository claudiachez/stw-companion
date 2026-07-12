/**
 * ibkr-sync-cron — nightly automated Flex sync for every connected user.
 *
 * Why: the interactive sync only runs when a user opens the app and clicks Sync.
 * The Flex Trades lookback slides forward daily, so a fill that scrolls out of the
 * window before the next manual sync is unrecoverable. This cron closes that gap —
 * each connected user is synced once per trading day into the append-only
 * user_executions log, so nothing is ever dropped even if they never log in.
 *
 * Runs at 08:00 UTC Tue–Sat (~4am ET) — after the prior US trading day has settled.
 * Combined with the recommended "Last 7 Days" Flex window, a late-settling day or a
 * single missed run is re-covered by the next run (idempotent upsert on ibExecID).
 *
 * Uses the SAME fetch/parse/persist pipeline as the interactive sync (_lib/flex-core),
 * so there is one implementation and no drift. Sequential per user with a per-user
 * try/catch — one bad account never aborts the rest.
 *
 * Scale note: sequential syncs at ~a few seconds each fit comfortably for the current
 * single-digit user count. If the connected-user count grows large, batch/stagger this
 * (or move to a queue) so total runtime stays within the function limit.
 */
import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { fetchFlexReport, parseFlexReport, persistFlexResult } from '../_lib/flex-core';

const handlerImpl: Handler = async () => {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  const ranAt = new Date().toISOString();
  const logRun = async (status: string, messagesProcessed: number, summary: string) => {
    try {
      await admin.from('run_log').insert({
        run_type: 'ibkr-sync-cron', status, messages_processed: messagesProcessed,
        ran_at: ranAt, summary: summary.slice(0, 500),
      });
    } catch { /* run_log is best-effort */ }
  };

  try {
    // Every user who has both Flex credentials configured.
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('user_id, ibkr_flex_token, ibkr_query_id')
      .not('ibkr_flex_token', 'is', null)
      .not('ibkr_query_id', 'is', null);
    if (error) { await logRun('error', 0, `profiles query failed: ${error.message}`); return { statusCode: 500, body: 'query failed' }; }

    const connected = (profiles ?? []).filter((p) => p.ibkr_flex_token?.trim() && p.ibkr_query_id?.trim());
    if (connected.length === 0) { await logRun('ok', 0, 'no connected users'); return { statusCode: 200, body: 'no connected users' }; }

    let synced = 0;
    let totalExecutions = 0;
    const failures: string[] = [];

    for (const p of connected) {
      const uid = String(p.user_id);
      try {
        // Cron has a generous budget (not bound by the interactive 10s limit).
        const fetched = await fetchFlexReport(p.ibkr_flex_token!.trim(), p.ibkr_query_id!.trim(), { maxPolls: 15, pollDelayMs: 2000 });
        if (!fetched.ok || !fetched.xml) { failures.push(`${uid.slice(0, 8)}: ${fetched.error ?? 'fetch failed'}`); continue; }
        const parsed = parseFlexReport(fetched.xml);
        const res = await persistFlexResult(admin, uid, parsed, new Date().toISOString());
        synced += 1;
        totalExecutions += res.executions;
      } catch (e) {
        failures.push(`${uid.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const summary = `synced ${synced}/${connected.length} users · ${totalExecutions} executions upserted`
      + (failures.length ? ` · failures: ${failures.join('; ')}` : '');
    await logRun(failures.length ? 'error' : 'ok', synced, summary);
    return { statusCode: 200, body: summary };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await logRun('error', 0, `threw: ${detail}`);
    return { statusCode: 500, body: detail };
  }
};

export const handler = schedule('0 8 * * 2-6', handlerImpl);
