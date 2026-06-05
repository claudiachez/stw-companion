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

const FLEX_SEND    = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest';
const FLEX_GET     = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement';
const MAX_POLLS    = 6;
const POLL_DELAY   = 2000;

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

  // For options, IBKR uses the full OCC symbol in `symbol`; underlyingSymbol
  // carries the clean ticker. For stocks they're the same.
  const underlying = (cat === 'OPT' && raw.underlyingSymbol)
    ? raw.underlyingSymbol.trim()
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

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  // ── Auth: verify Supabase JWT ────────────────────────────────
  const authHeader = event.headers['authorization'] ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return err(401, 'Missing Authorization header');

  const supabaseUrl  = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return err(500, 'Server misconfigured');

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !user) return err(401, 'Invalid or expired session');

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

  // ── Parse positions ──────────────────────────────────────────
  let positions: NormalisedPosition[];
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      isArray: (name) => name === 'OpenPosition',
    });
    const doc = parser.parse(xmlData);
    const raw: RawPosition[] =
      doc?.FlexQueryResponse?.FlexStatements?.FlexStatement?.OpenPositions?.OpenPosition ?? [];
    positions = (Array.isArray(raw) ? raw : [raw])
      .map(normalise)
      .filter((p): p is NormalisedPosition => p !== null);
  } catch {
    return err(502, 'Failed to parse IBKR response');
  }

  if (positions.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, count: 0, message: 'No open positions found in the Flex report.' }),
    };
  }

  // ── Upsert into user_positions ───────────────────────────────
  const syncTime = new Date().toISOString();
  const rows = positions.map((p) => ({ ...p, user_id: user.id, last_synced_at: syncTime }));

  // Delete stale positions (ones no longer in IBKR) then insert fresh
  await admin.from('user_positions').delete().eq('user_id', user.id);
  const { error: insertErr } = await admin.from('user_positions').insert(rows);
  if (insertErr) return err(500, `DB write failed: ${insertErr.message}`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, count: positions.length, lastSyncedAt: syncTime }),
  };
};
