/**
 * IBKR Flex Query proxy.
 *
 * Security model: the raw Flex token never travels through the browser.
 * The client sends its Supabase JWT; this function verifies it, reads the
 * user's stored credentials via service key, calls IBKR, parses the XML,
 * upserts the positions into user_positions, then returns a summary.
 *
 * Required Netlify env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * IBKR Flex Web Service is a two-step HTTP API:
 *   1. SendRequest → get a ReferenceCode
 *   2. GetStatement (poll until ready) → XML positions report
 */
import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import ws from 'ws';

const FLEX_SEND    = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest';
const FLEX_GET     = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement';
const MAX_POLLS    = 4;   // 4 × 1.5 s = 6 s max — fits the 10 s Netlify free-tier limit
const POLL_DELAY   = 1500;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function err(statusCode: number, message: string) {
  return { statusCode, body: JSON.stringify({ error: message }) };
}

interface RawPosition {
  assetCategory:    string;
  symbol:           string;
  underlyingSymbol: string;
  conid:            string;
  position:         string;
  costBasisPrice:   string;
  markPrice:        string;
  fifoPnlUnrealized:string;
  costBasisMoney:   string;
  multiplier:       string;
  // options
  putCall:          string;
  strike:           string;
  expiry:           string;
}

interface NormalisedPosition {
  underlying:         string;
  asset_class:        string;
  conid:              string;
  quantity:           number;
  avg_cost:           number | null;
  mark_price:         number | null;
  unrealized_pnl:     number | null;
  unrealized_pnl_pct: number | null;
  strike:             number | null;
  put_call:           string | null;
  expiry:             string | null;
  multiplier:         number;
}

function parseNum(s: string | undefined): number | null {
  if (s === undefined || s === '' || s === '--') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function normalise(raw: RawPosition): NormalisedPosition | null {
  const cat = (raw.assetCategory ?? '').toUpperCase();
  if (cat !== 'STK' && cat !== 'OPT') return null;

  const costBasisMoney = parseNum(raw.costBasisMoney);
  const pnlRaw         = parseNum(raw.fifoPnlUnrealized);
  const pnlPct =
    pnlRaw !== null && costBasisMoney !== null && costBasisMoney !== 0
      ? (pnlRaw / Math.abs(costBasisMoney)) * 100
      : null;

  // For options, prefer underlyingSymbol (clean ticker). If not included in the
  // Flex Query, fall back to extracting the ticker from the OCC symbol — the OCC
  // format is "TICKER  YYMMDD[C/P]STRIKE" so everything before the first gap of
  // whitespace is the underlying ticker (e.g. "ADEA  260918C00035000" → "ADEA").
  // Extract clean underlying ticker from OCC symbol when underlyingSymbol is absent.
  // OCC format: "TICKER  YYMMDD[C/P]STRIKE" (spaces) or "TICKERYYMMDD[C/P]STRIKE" (compact).
  // Split on whitespace first; if no spaces, strip from the first digit onward.
  const occTicker = raw.symbol.trim().split(/\s+/)[0].replace(/\d.*$/, '');
  const underlying = cat === 'OPT'
    ? (raw.underlyingSymbol?.trim() || occTicker)
    : raw.symbol.trim();

  return {
    underlying,
    asset_class:        cat,
    conid:              raw.conid,
    quantity:           parseNum(raw.position) ?? 0,
    avg_cost:           parseNum(raw.costBasisPrice),
    mark_price:         parseNum(raw.markPrice),
    unrealized_pnl:     pnlRaw,
    unrealized_pnl_pct: pnlPct !== null ? Math.round(pnlPct * 100) / 100 : null,
    multiplier:         parseNum(raw.multiplier) ?? 1,
    // options-specific
    strike:    cat === 'OPT' ? parseNum(raw.strike)  : null,
    put_call:  cat === 'OPT' ? (raw.putCall || null)  : null,
    expiry:    cat === 'OPT' ? (raw.expiry  || null)  : null,
  };
}

// ── Executions (Flex "Trades / executions" section) ──────────────────────────
// Append-only fills, keyed on ibExecID. Unlike positions (a mutable snapshot),
// these are an immutable log — the Flex lookback window slides daily so a fill
// that ages out is unrecoverable; every one we've ever seen must be kept.
interface RawTrade {
  ibExecID:         string;
  ibOrderID:        string;
  tradeID:          string;
  transactionID:    string;
  symbol:           string;
  underlyingSymbol: string;
  assetCategory:    string;
  buySell:          string;
  quantity:         string;
  tradePrice:       string;
  ibCommission:     string;
  proceeds:         string;
  currency:         string;
  putCall:          string;
  strike:           string;
  expiry:           string;
  multiplier:       string;
  dateTime:         string;
  tradeDate:        string;
  tradeTime:        string;
  accountId:        string;
  levelOfDetail:    string;
}

interface NormalisedExecution {
  ibkr_exec_id:      string;
  order_id:          string | null;
  trade_id:          string | null;
  transaction_id:    string | null;
  underlying:        string;
  symbol:            string | null;
  asset_class:       string;
  side:              'BUY' | 'SELL' | null;
  quantity:          number | null;
  price:             number | null;
  commission:        number | null;
  proceeds:          number | null;
  currency:          string | null;
  strike:            number | null;
  put_call:          string | null;
  expiry:            string | null;
  multiplier:        number;
  executed_at:       string;      // ISO instant
  exec_datetime_raw: string | null;
  account:           string | null;
}

// ET wall-clock offset (minutes) for a given UTC instant, via Intl (no tz lib).
function etOffsetMinutes(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  // 24:xx can appear for midnight in some environments — normalise to 0.
  const hour = p.hour === 24 ? 0 : p.hour;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, hour, p.minute, p.second);
  return (asUtc - utcMs) / 60000;
}

// Parse an IBKR Flex dateTime into an ISO instant. Flex default format is
// "yyyyMMdd;HHmmss" (sometimes space-separated, sometimes with a trailing tz
// token). The naive wall-clock is interpreted as America/New_York (the default
// report tz for a US account); the raw string is preserved by the caller so the
// assumption stays auditable. Falls back to tradeDate/tradeTime.
function parseFlexDateTime(dt: string | undefined, tradeDate?: string, tradeTime?: string): string | null {
  let dateStr = '';
  let timeStr = '000000';
  const src = (dt ?? '').trim();
  if (src) {
    // Strip a trailing timezone token (e.g. "20250115;103005 US/Eastern").
    const noTz = src.replace(/\s+[A-Za-z][A-Za-z0-9/_+-]*$/, '').trim();
    const m = noTz.match(/^(\d{8})[;\sT]?(\d{6})?/);
    if (m) {
      dateStr = m[1];
      if (m[2]) timeStr = m[2];
    }
  }
  if (!dateStr && tradeDate) {
    dateStr = tradeDate.trim().replace(/-/g, '');
    if (tradeTime) timeStr = tradeTime.trim().replace(/:/g, '').padEnd(6, '0').slice(0, 6);
  }
  if (!/^\d{8}$/.test(dateStr)) return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  const mo = parseInt(dateStr.slice(4, 6), 10);
  const d = parseInt(dateStr.slice(6, 8), 10);
  const h = parseInt(timeStr.slice(0, 2), 10) || 0;
  const mi = parseInt(timeStr.slice(2, 4), 10) || 0;
  const s = parseInt(timeStr.slice(4, 6), 10) || 0;
  // Convert ET wall-clock → UTC instant (two passes for DST-boundary safety).
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = guess - etOffsetMinutes(guess) * 60000;
  utc = guess - etOffsetMinutes(utc) * 60000;
  return new Date(utc).toISOString();
}

function normaliseExecution(raw: RawTrade): NormalisedExecution | null {
  const execId = (raw.ibExecID ?? '').trim();
  if (!execId) return null;                       // require an execution-level row
  const cat = (raw.assetCategory ?? '').toUpperCase();
  if (cat !== 'STK' && cat !== 'OPT') return null;

  const executedAt = parseFlexDateTime(raw.dateTime, raw.tradeDate, raw.tradeTime);
  if (!executedAt) return null;                   // no usable timestamp → skip (never fabricate a date)

  const occTicker = (raw.symbol ?? '').trim().split(/\s+/)[0].replace(/\d.*$/, '');
  const underlying = cat === 'OPT'
    ? (raw.underlyingSymbol?.trim() || occTicker)
    : (raw.symbol?.trim() || occTicker);
  const bs = (raw.buySell ?? '').toUpperCase();

  return {
    ibkr_exec_id:      execId,
    order_id:          raw.ibOrderID?.trim() || null,
    trade_id:          raw.tradeID?.trim() || null,
    transaction_id:    raw.transactionID?.trim() || null,
    underlying,
    symbol:            raw.symbol?.trim() || null,
    asset_class:       cat,
    side:              bs === 'BUY' ? 'BUY' : bs === 'SELL' ? 'SELL' : null,
    quantity:          parseNum(raw.quantity),
    price:             parseNum(raw.tradePrice),
    commission:        parseNum(raw.ibCommission),
    proceeds:          parseNum(raw.proceeds),
    currency:          raw.currency?.trim() || null,
    strike:            cat === 'OPT' ? parseNum(raw.strike) : null,
    put_call:          cat === 'OPT' ? (raw.putCall || null) : null,
    expiry:            cat === 'OPT' ? (raw.expiry || null) : null,
    multiplier:        parseNum(raw.multiplier) ?? 1,
    executed_at:       executedAt,
    exec_datetime_raw: (raw.dateTime ?? '').trim() || null,
    account:           raw.accountId?.trim() || null,
  };
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

  // ── Auth: verify Supabase JWT ────────────────────────────────
  const authHeader = event.headers['authorization'] ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return err(401, 'Missing Authorization header');

  const supabaseUrl  = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return err(500, 'Server misconfigured');

  // Node.js 20 has no native WebSocket; pass the 'ws' package as the
  // Realtime transport to prevent Supabase from throwing on client init.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  // Defensive: avoid destructuring data.user directly — Supabase v2 can return
  // data: null on network errors, which would throw TypeError before our catch.
  const authResult = await admin.auth.getUser(jwt);
  const user = authResult.data?.user ?? null;
  if (authResult.error || !user) return err(401, 'Invalid or expired session');

  // ── Fetch IBKR credentials from profiles ────────────────────
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('ibkr_flex_token, ibkr_query_id')
    .eq('user_id', user.id)
    .single();

  if (profileErr || !profile) return err(404, 'Profile not found');
  const { ibkr_flex_token: token, ibkr_query_id: queryId } = profile;
  if (!token || !queryId) return err(400, 'IBKR credentials not configured');

  // ── Step 1: SendRequest ──────────────────────────────────────
  let refCode: string;
  try {
    const r1 = await fetch(`${FLEX_SEND}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`);
    const xml1 = await r1.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed1 = parser.parse(xml1);
    const resp1 = parsed1?.FlexStatementResponse;
    if (!resp1 || resp1.Status !== 'Success') {
      const msg = resp1?.ErrorMessage ?? 'IBKR rejected the request';
      return err(400, String(msg));
    }
    refCode = String(resp1.ReferenceCode);
  } catch {
    return err(502, 'Failed to contact IBKR (step 1)');
  }

  // ── Step 2: GetStatement (poll until ready) ──────────────────
  let xmlData: string | null = null;
  for (let i = 0; i < MAX_POLLS; i++) {
    await delay(POLL_DELAY);
    try {
      const r2 = await fetch(`${FLEX_GET}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(refCode)}&v=3`);
      const xml2 = await r2.text();
      // While IBKR is still building the report it returns a short Processing XML
      if (xml2.includes('<Status>Processing</Status>') || xml2.includes('<Status>Warn</Status>')) continue;
      xmlData = xml2;
      break;
    } catch {
      // transient — keep polling
    }
  }

  if (!xmlData) return err(504, 'IBKR report timed out. Try again in a few seconds.');

  // ── Parse positions + executions (both from the one Flex report) ──────────
  let positions: NormalisedPosition[];
  let executions: NormalisedExecution[];
  let accountId: string | null = null;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      isArray: (name) => name === 'OpenPosition' || name === 'Trade',
    });
    const doc = parser.parse(xmlData);
    const statement = doc?.FlexQueryResponse?.FlexStatements?.FlexStatement;
    // FlexStatement carries the resolved account as an XML attribute — surfaced back to
    // the client so a save-time verification can echo a concrete "resolved to account
    // Uxxxxxxx" fact, rather than only a bare position count.
    accountId = statement?.accountId ? String(statement.accountId) : null;
    const rawPos: RawPosition[] = statement?.OpenPositions?.OpenPosition ?? [];
    positions = (Array.isArray(rawPos) ? rawPos : [rawPos])
      .map(normalise)
      .filter((p): p is NormalisedPosition => p !== null);
    // The Trades section is optional — absent until the operator enables it on the
    // Flex template. When absent we simply write zero executions (never an error).
    const rawTrades: RawTrade[] = statement?.Trades?.Trade ?? [];
    executions = (Array.isArray(rawTrades) ? rawTrades : [rawTrades])
      .filter((t): t is RawTrade => t != null)
      .map(normaliseExecution)
      .filter((e): e is NormalisedExecution => e !== null);
  } catch {
    return err(502, 'Failed to parse IBKR response');
  }

  const syncTime = new Date().toISOString();

  // ── Refresh user_positions (mutable snapshot: delete-all-then-insert) ─────
  // Positions can legitimately be empty (fully-cash account) — that is not an
  // error, and executions may still be present, so we no longer early-return.
  if (positions.length > 0) {
    const posRows = positions.map((p) => ({ ...p, user_id: user.id, last_synced_at: syncTime }));
    await admin.from('user_positions').delete().eq('user_id', user.id);
    const { error: insertErr } = await admin.from('user_positions').insert(posRows);
    if (insertErr) return err(500, `DB write failed (positions): ${insertErr.message}`);
  }

  // ── Append user_executions (immutable log: idempotent upsert, never delete) ─
  let executionsWritten = 0;
  if (executions.length > 0) {
    const execRows = executions.map((e) => ({ ...e, user_id: user.id, synced_at: syncTime }));
    const { error: execErr } = await admin
      .from('user_executions')
      .upsert(execRows, { onConflict: 'user_id,ibkr_exec_id', ignoreDuplicates: true });
    if (execErr) return err(500, `DB write failed (executions): ${execErr.message}`);
    executionsWritten = execRows.length;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      count: positions.length,
      executions: executionsWritten,
      accountId,
      lastSyncedAt: syncTime,
      ...(positions.length === 0 ? { message: 'No open positions found in the Flex report.' } : {}),
    }),
  };
}
