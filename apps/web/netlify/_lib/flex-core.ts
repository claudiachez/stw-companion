/**
 * Shared IBKR Flex logic — the fetch + parse + persist pipeline, extracted so the
 * three consumers use ONE implementation (no drift):
 *   - ibkr-flex.ts        — interactive per-user sync (browser → JWT)
 *   - ibkr-sync-cron.ts   — nightly automated sync of every connected user
 *   - ibkr-import.ts      — one-time full-history import from an uploaded Flex XML
 *
 * IBKR Flex Web Service is a two-step HTTP API:
 *   1. SendRequest → ReferenceCode
 *   2. GetStatement (poll until ready) → the XML report
 *
 * The one Activity Flex report carries up to four sections, written with different
 * semantics downstream:
 *   OpenPositions          → user_positions   (mutable snapshot: delete-all-then-insert)
 *   Trades                 → user_executions  (append-only log: idempotent on ibExecID)
 *   EquitySummaryInBase    → risk_config.ibkr_nlv (latest reportDate total = live NLV)
 *   ChangeInNAV            → risk_config.cumulative_cashflow (depositsWithdrawals, for
 *                            cash-flow-adjusted drawdown — IMPORT ONLY; the rolling daily
 *                            sync can't accumulate it without double-counting, migr. 071)
 */
import { XMLParser } from 'fast-xml-parser';

const FLEX_SEND = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest';
const FLEX_GET  = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement';

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ── Raw / normalised shapes ──────────────────────────────────────────────────
interface RawPosition {
  assetCategory: string; symbol: string; underlyingSymbol: string; conid: string;
  position: string; costBasisPrice: string; costBasisMoney: string; markPrice: string;
  fifoPnlUnrealized: string; multiplier: string; putCall: string; strike: string; expiry: string;
}

export interface NormalisedPosition {
  underlying: string; asset_class: string; conid: string; quantity: number;
  avg_cost: number | null; mark_price: number | null; unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null; strike: number | null; put_call: string | null;
  expiry: string | null; multiplier: number;
}

interface RawTrade {
  ibExecID: string; ibOrderID: string; tradeID: string; transactionID: string;
  symbol: string; underlyingSymbol: string; assetCategory: string; buySell: string;
  quantity: string; tradePrice: string; origTradePrice: string; ibCommission: string;
  proceeds: string; currency: string; putCall: string; strike: string; expiry: string;
  multiplier: string; dateTime: string; tradeDate: string; tradeTime: string;
  accountId: string; levelOfDetail: string;
}

export interface NormalisedExecution {
  ibkr_exec_id: string; order_id: string | null; trade_id: string | null;
  transaction_id: string | null; underlying: string; symbol: string | null;
  asset_class: string; side: 'BUY' | 'SELL' | null; quantity: number | null;
  price: number | null; commission: number | null; proceeds: number | null;
  currency: string | null; strike: number | null; put_call: string | null;
  expiry: string | null; multiplier: number; executed_at: string;
  exec_datetime_raw: string | null; account: string | null;
}

export interface ParsedFlexReport {
  positions: NormalisedPosition[];
  executions: NormalisedExecution[];
  /** Latest reportDate's Net Liquidation Value; null if the NAV section is absent/empty. */
  nlv: number | null;
  /** Net external cash in/out over the report period (Change in NAV section); null if absent. */
  depositsWithdrawals: number | null;
  accountId: string | null;
  /** Human-readable config problems (a section or a field the query is missing). */
  warnings: string[];
}

function parseNum(s: string | undefined): number | null {
  if (s === undefined || s === '' || s === '--') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ET wall-clock offset (minutes) for a UTC instant, via Intl (no tz lib).
function etOffsetMinutes(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  const hour = p.hour === 24 ? 0 : p.hour;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, hour, p.minute, p.second);
  return (asUtc - utcMs) / 60000;
}

// Parse an IBKR Flex dateTime ("yyyyMMdd;HHmmss", sometimes space/tz-suffixed) into an
// ISO instant, interpreting the wall-clock as America/New_York. Falls back to tradeDate/Time.
function parseFlexDateTime(dt: string | undefined, tradeDate?: string, tradeTime?: string): string | null {
  let dateStr = '';
  let timeStr = '000000';
  const src = (dt ?? '').trim();
  if (src) {
    const noTz = src.replace(/\s+[A-Za-z][A-Za-z0-9/_+-]*$/, '').trim();
    const m = noTz.match(/^(\d{8})[;\sT]?(\d{6})?/);
    if (m) { dateStr = m[1]; if (m[2]) timeStr = m[2]; }
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
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = guess - etOffsetMinutes(guess) * 60000;
  utc = guess - etOffsetMinutes(utc) * 60000;
  return new Date(utc).toISOString();
}

function normalise(raw: RawPosition): NormalisedPosition | null {
  const cat = (raw.assetCategory ?? '').toUpperCase();
  if (cat !== 'STK' && cat !== 'OPT') return null;

  const position = parseNum(raw.position) ?? 0;
  const multiplier = parseNum(raw.multiplier) ?? 1;
  const costBasisPrice = parseNum(raw.costBasisPrice);
  // Prefer the explicit Cost Basis Money column; fall back to price × |qty| × multiplier
  // when the query omits it, so return % still populates.
  const costBasisMoney = parseNum(raw.costBasisMoney)
    ?? (costBasisPrice !== null ? costBasisPrice * Math.abs(position) * multiplier : null);
  const pnlRaw = parseNum(raw.fifoPnlUnrealized);
  const pnlPct = pnlRaw !== null && costBasisMoney !== null && costBasisMoney !== 0
    ? (pnlRaw / Math.abs(costBasisMoney)) * 100
    : null;

  const occTicker = raw.symbol.trim().split(/\s+/)[0].replace(/\d.*$/, '');
  const underlying = cat === 'OPT' ? (raw.underlyingSymbol?.trim() || occTicker) : raw.symbol.trim();

  return {
    underlying, asset_class: cat, conid: raw.conid, quantity: position,
    avg_cost: costBasisPrice, mark_price: parseNum(raw.markPrice), unrealized_pnl: pnlRaw,
    unrealized_pnl_pct: pnlPct !== null ? Math.round(pnlPct * 100) / 100 : null,
    multiplier,
    strike: cat === 'OPT' ? parseNum(raw.strike) : null,
    put_call: cat === 'OPT' ? (raw.putCall || null) : null,
    expiry: cat === 'OPT' ? (raw.expiry || null) : null,
  };
}

function normaliseExecution(raw: RawTrade): NormalisedExecution | null {
  const execId = (raw.ibExecID ?? '').trim();
  if (!execId) return null;                       // require an execution-level row
  const cat = (raw.assetCategory ?? '').toUpperCase();
  if (cat !== 'STK' && cat !== 'OPT') return null;

  const executedAt = parseFlexDateTime(raw.dateTime, raw.tradeDate, raw.tradeTime);
  if (!executedAt) return null;                   // never fabricate a date

  const occTicker = (raw.symbol ?? '').trim().split(/\s+/)[0].replace(/\d.*$/, '');
  const underlying = cat === 'OPT'
    ? (raw.underlyingSymbol?.trim() || occTicker)
    : (raw.symbol?.trim() || occTicker);
  const bs = (raw.buySell ?? '').toUpperCase();

  return {
    ibkr_exec_id: execId,
    order_id: raw.ibOrderID?.trim() || null,
    trade_id: raw.tradeID?.trim() || null,
    transaction_id: raw.transactionID?.trim() || null,
    underlying,
    symbol: raw.symbol?.trim() || null,
    asset_class: cat,
    side: bs === 'BUY' ? 'BUY' : bs === 'SELL' ? 'SELL' : null,
    quantity: parseNum(raw.quantity),
    // Trade Price is the true fill price. Orig Trade Price is a lookalike that is
    // frequently "0" (the pre-amendment price), so it's used ONLY as a last resort
    // and ONLY when positive — never store a bogus $0 fill (that would poison TCA).
    // If Trade Price is missing entirely, parseFlexReport also raises a warning.
    price: (() => {
      const tp = parseNum(raw.tradePrice);
      if (tp !== null) return tp;
      const otp = parseNum(raw.origTradePrice);
      return otp !== null && otp > 0 ? otp : null;
    })(),
    commission: parseNum(raw.ibCommission),
    proceeds: parseNum(raw.proceeds),
    currency: raw.currency?.trim() || null,
    strike: cat === 'OPT' ? parseNum(raw.strike) : null,
    put_call: cat === 'OPT' ? (raw.putCall || null) : null,
    expiry: cat === 'OPT' ? (raw.expiry || null) : null,
    multiplier: parseNum(raw.multiplier) ?? 1,
    executed_at: executedAt,
    exec_datetime_raw: (raw.dateTime ?? '').trim() || null,
    account: raw.accountId?.trim() || null,
  };
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/**
 * Parse a Flex report XML string into normalised sections + config warnings.
 * Warnings flag a query the user has mis-configured (a missing section or field) —
 * surfaced so they can fix the Flex template rather than silently getting empty data.
 */
export function parseFlexReport(xml: string): ParsedFlexReport {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name) => name === 'OpenPosition' || name === 'Trade' || name === 'EquitySummaryByReportDateInBase',
  });
  const doc = parser.parse(xml);
  const statement = doc?.FlexQueryResponse?.FlexStatements?.FlexStatement;
  const accountId = statement?.accountId ? String(statement.accountId) : null;

  const warnings: string[] = [];

  // ── Open Positions ──
  const hasPositionsSection = statement?.OpenPositions !== undefined;
  const rawPos = asArray<RawPosition>(statement?.OpenPositions?.OpenPosition);
  const positions = rawPos.map(normalise).filter((p): p is NormalisedPosition => p !== null);
  if (!hasPositionsSection) {
    warnings.push('No Open Positions section in your Flex query — your live positions and the Risk-tab concentration checks won’t populate. Add the "Open Positions" section.');
  }

  // ── Trades / executions ──
  const hasTradesSection = statement?.Trades !== undefined;
  const rawTrades = asArray<RawTrade>(statement?.Trades?.Trade).filter((t) => t != null);
  const executions = rawTrades.map(normaliseExecution).filter((e): e is NormalisedExecution => e !== null);
  if (hasTradesSection && rawTrades.length > 0) {
    // Level of Detail must be Execution (an ibExecID on each row). If none carry one,
    // the section is at Order/Symbol summary level and no fills can be logged.
    if (!rawTrades.some((t) => (t.ibExecID ?? '').trim())) {
      warnings.push('Your Trades section has no IB Execution ID — set the Trades section’s "Level of Detail" to Execution and tick "IB Execution ID" (not External).');
    }
    // Fill price: Trade Price is the only reliable fill price. Warn if it's absent even
    // when Orig Trade Price is present — the latter is often "0" and not a real fill.
    if (!rawTrades.some((t) => (t.tradePrice ?? '') !== '')) {
      warnings.push('Your Trades section has no Trade Price — tick "Trade Price" (not "Orig Trade Price") so fill prices import. Without it, trade-cost analysis has no fill price.');
    }
  }

  // ── NAV (live equity) ──
  const navRows = asArray<Record<string, unknown>>(statement?.EquitySummaryInBase?.EquitySummaryByReportDateInBase)
    .filter((r) => r && r.total != null);
  let nlv: number | null = null;
  if (statement?.EquitySummaryInBase === undefined) {
    warnings.push('No Net Asset Value (NAV) section — the Risk tab will fall back to your manually-entered equity. Add "Net Asset Value (NAV) in Base" (tick Total + Report Date).');
  } else if (navRows.length) {
    navRows.sort((a, b) => String(a.reportDate ?? '').localeCompare(String(b.reportDate ?? '')));
    const t = parseFloat(String(navRows[navRows.length - 1].total));
    nlv = Number.isFinite(t) && t > 0 ? t : null;
  }

  // ── Change in NAV → net deposits/withdrawals (for cash-flow-adjusted drawdown) ──
  // Single element with per-line-item attributes; we only need depositsWithdrawals.
  const cin = statement?.ChangeInNAV;
  const cinObj = Array.isArray(cin) ? cin[0] : cin;
  const depositsWithdrawals = cinObj ? parseNum(String(cinObj.depositsWithdrawals ?? '')) : null;

  return { positions, executions, nlv, depositsWithdrawals, accountId, warnings };
}

// ── Two-step fetch ────────────────────────────────────────────────────────────
export interface FlexFetchResult {
  ok: boolean;
  xml?: string;
  /** On failure: a user-facing message + a suggested HTTP status for the handler. */
  error?: string;
  status?: number;
}

/**
 * Run the two-step Flex Web Service fetch. `maxPolls`/`pollDelayMs` bound the wait —
 * the interactive path keeps them short (Netlify 10s limit); the cron can wait longer.
 */
export async function fetchFlexReport(
  token: string,
  queryId: string,
  opts: { maxPolls?: number; pollDelayMs?: number } = {},
): Promise<FlexFetchResult> {
  const maxPolls = opts.maxPolls ?? 4;
  const pollDelayMs = opts.pollDelayMs ?? 1500;
  const parser = new XMLParser({ ignoreAttributes: false });

  // Step 1 — SendRequest
  let refCode: string;
  try {
    const r1 = await fetch(`${FLEX_SEND}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`);
    const parsed1 = parser.parse(await r1.text());
    const resp1 = parsed1?.FlexStatementResponse;
    if (!resp1 || resp1.Status !== 'Success') {
      const msg = String(resp1?.ErrorMessage ?? 'IBKR rejected the request');
      // 1001/1018/etc. transient generation/rate-limit messages — usually right after a
      // template change or when the query is re-requested too soon.
      const transient = /generated at this time|try again|please try|too many/i.test(msg);
      return {
        ok: false, status: transient ? 503 : 400,
        error: transient
          ? `${msg} — usually IBKR briefly rate-limiting (common right after changing your Flex template). Wait ~a minute, then sync once.`
          : msg,
      };
    }
    refCode = String(resp1.ReferenceCode);
  } catch {
    return { ok: false, status: 502, error: 'Failed to contact IBKR (step 1)' };
  }

  // Step 2 — GetStatement (poll until ready)
  for (let i = 0; i < maxPolls; i++) {
    await delay(pollDelayMs);
    try {
      const r2 = await fetch(`${FLEX_GET}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(refCode)}&v=3`);
      const xml2 = await r2.text();
      if (xml2.includes('<Status>Processing</Status>') || xml2.includes('<Status>Warn</Status>')) continue;
      return { ok: true, xml: xml2 };
    } catch {
      // transient — keep polling
    }
  }
  return { ok: false, status: 504, error: 'IBKR report timed out. Try again in a few seconds.' };
}

// ── Persistence ────────────────────────────────────────────────────────────────
// Uses a supabase-js admin client (created by the caller, with the ws transport shim).
type Admin = ReturnType<typeof import('@supabase/supabase-js').createClient>;

export interface PersistResult { count: number; executions: number; nlv: number | null; }

/**
 * Persist a parsed report for one user. Flags let a caller write only what it has:
 *   - positions: delete-all-then-insert (mutable snapshot). Skipped when empty (a fully
 *     cash account is legitimate) unless the section was genuinely present-but-empty.
 *   - executions: upsert on (user_id, ibkr_exec_id), never delete (immutable log). Mode:
 *       'append'  (default, the daily sync) — ignoreDuplicates: a seen fill is never
 *                 re-touched, so overlapping windows don't churn.
 *       'refresh' (the manual import) — update-on-conflict, so re-importing an
 *                 authoritative export CORRECTS existing rows (e.g. backfills a price
 *                 that an older, Trade-Price-less sync stored as null). Import is the
 *                 sanctioned "repair my history" path; the append-only sync never does this.
 *   - nlv: UPDATE ibkr_nlv (the DB trigger fn_risk_config_track_equity_peak derives
 *     the cash-flow-adjusted equity_peak high-water mark from it — see migration 071).
 *   - cashflow: UPDATE cumulative_cashflow from ChangeInNAV depositsWithdrawals. Only
 *     the one-time full-history IMPORT sets this — the daily "Last 7 Days" sync must
 *     NOT, because summing a rolling window's period aggregate across overlapping runs
 *     would double-count (see migration 071's header for the full rationale).
 */
export async function persistFlexResult(
  admin: Admin,
  userId: string,
  parsed: ParsedFlexReport,
  syncTime: string,
  flags: { positions?: boolean; executions?: boolean; nlv?: boolean; cashflow?: boolean; executionsMode?: 'append' | 'refresh' } = {},
): Promise<PersistResult> {
  const writePositions = flags.positions ?? true;
  const writeExecutions = flags.executions ?? true;
  const writeNlv = flags.nlv ?? true;
  const writeCashflow = flags.cashflow ?? false;
  const executionsMode = flags.executionsMode ?? 'append';

  let count = 0;
  if (writePositions && parsed.positions.length > 0) {
    const posRows = parsed.positions.map((p) => ({ ...p, user_id: userId, last_synced_at: syncTime }));
    await admin.from('user_positions').delete().eq('user_id', userId);
    const { error } = await admin.from('user_positions').insert(posRows);
    if (error) throw new Error(`DB write failed (positions): ${error.message}`);
    count = posRows.length;
  }

  let executionsWritten = 0;
  if (writeExecutions && parsed.executions.length > 0) {
    const execRows = parsed.executions.map((e) => ({ ...e, user_id: userId, synced_at: syncTime }));
    const { error } = await admin
      .from('user_executions')
      .upsert(execRows, { onConflict: 'user_id,ibkr_exec_id', ignoreDuplicates: executionsMode === 'append' });
    if (error) throw new Error(`DB write failed (executions): ${error.message}`);
    executionsWritten = execRows.length;
  }

  if (writeNlv && parsed.nlv !== null) {
    // equity_peak is NOT set here — the risk_config BEFORE-UPDATE trigger derives the
    // cash-flow-adjusted high-water mark from ibkr_nlv + cumulative_cashflow (071).
    await admin.from('risk_config').update({ ibkr_nlv: parsed.nlv, ibkr_nlv_at: syncTime }).eq('user_id', userId);
  }

  // Authoritative full-history net cash flow (import only — see the flag doc above).
  if (writeCashflow && parsed.depositsWithdrawals !== null) {
    await admin.from('risk_config')
      .update({ cumulative_cashflow: parsed.depositsWithdrawals, cumulative_cashflow_at: syncTime })
      .eq('user_id', userId);
  }

  return { count, executions: executionsWritten, nlv: parsed.nlv };
}
