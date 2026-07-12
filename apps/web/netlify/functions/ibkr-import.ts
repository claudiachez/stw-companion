/**
 * ibkr-import — one-time full-history import from an uploaded Flex XML export.
 *
 * The live sync uses a short "Last 7 Days" window (so the Flex Web Service can
 * generate it quickly). That window can't reach back over prior months. To seed a
 * new user's full execution history, they export a long-period Activity Flex report
 * from the IBKR portal (the portal builds big reports the API refuses) and upload
 * the XML here. We parse it with the SAME pipeline as the live sync and append the
 * fills to user_executions (idempotent on ibExecID — safe to run alongside daily
 * syncs, zero duplicates).
 *
 * This writes EXECUTIONS ONLY. Positions + NLV are a live snapshot owned by the
 * daily sync; a historical export's positions could be stale, so we never overwrite
 * the live snapshot from an import.
 *
 * Security: same JWT model as ibkr-flex — the caller can only import into their own
 * user_executions (service key + verified user id).
 */
import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { parseFlexReport, persistFlexResult } from '../_lib/flex-core';

function err(statusCode: number, message: string) {
  return { statusCode, body: JSON.stringify({ error: message }) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

    const jwt = (event.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return err(401, 'Missing Authorization header');

    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
    const serviceKey  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
    if (!supabaseUrl || !serviceKey) return err(500, 'Server misconfigured');

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: ws },
    });

    const authResult = await admin.auth.getUser(jwt);
    const user = authResult.data?.user ?? null;
    if (authResult.error || !user) return err(401, 'Invalid or expired session');

    // The uploaded Flex XML is the raw request body (Netlify may base64-encode it).
    const xml = event.isBase64Encoded && event.body
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : (event.body ?? '');
    if (!xml.includes('<FlexQueryResponse')) {
      return err(400, 'That doesn’t look like a Flex Query XML export. In the IBKR portal, run your query and download the XML, then upload that file.');
    }

    let parsed;
    try {
      parsed = parseFlexReport(xml);
    } catch {
      return err(422, 'Could not parse that Flex XML.');
    }

    if (parsed.executions.length === 0) {
      return err(422, 'No executions found in that file — make sure the export includes the Trades section at Execution level of detail.');
    }

    const syncTime = new Date().toISOString();
    let persisted;
    try {
      // Executions in 'refresh' mode — an explicit import is authoritative, so it
      // UPDATES existing fills (backfilling e.g. a price an older sync stored as null)
      // rather than skipping them. Live positions/NLV snapshot is never touched. The
      // import is ALSO the sole writer of cumulative_cashflow (full-history ChangeInNAV
      // net flow) — the daily sync can't accumulate a rolling window (migration 071).
      persisted = await persistFlexResult(admin, user.id, parsed, syncTime, { positions: false, executions: true, nlv: false, cashflow: true, executionsMode: 'refresh' });
    } catch (e) {
      return err(500, e instanceof Error ? e.message : 'DB write failed');
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        executions: persisted.executions,
        accountId: parsed.accountId,
        warnings: parsed.warnings,
      }),
    };
  } catch (e) {
    console.error('ibkr-import unhandled error', e);
    return err(500, `Server error: ${e instanceof Error ? e.message : String(e)}`);
  }
};
