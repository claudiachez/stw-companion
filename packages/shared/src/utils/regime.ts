/**
 * Advisory regime gate — plans/integrity-guardrails.md Item 3.
 *
 * A frozen, two-component market-regime rule under forward test. It is
 * deliberately NOT integrated with the Macro Dashboard composite in `macro.ts`
 * (standing prohibition, see the source spec) — no import from that module is
 * allowed here, even though a superficially similar "close vs 200SMA" concept
 * exists there. The gate must stay frozen while the Macro scorers evolve
 * freely; this is intentional, documented duplication, not an oversight.
 *
 * Advisory only — nothing here enforces a trade or a position change. See
 * docs/regime_exit_v0.md for the (unsigned, operator-owned) policy that would
 * act on this signal by hand.
 */

export type RegimeState = 'GREEN' | 'RED' | 'UNKNOWN';

export interface RegimeGateLadder {
  greenGreen: number;
  oneRed: number;
  redRed: number;
}

export interface RegimeGateConfig {
  engine_version: string;
  smaWindow: number;        // 200 — trend
  rocWindow: number;        // 252 — rate of change
  slopeWindow: number;      // 20 — SMA slope comparison window
  percentileWindow: number; // 504 — 2y realized-vol percentile window
  ladder: RegimeGateLadder;
}

/** Frozen parameters — bump `engine_version` on ANY change, never edit in place silently. */
export const REGIME_GATE_CONFIG: RegimeGateConfig = {
  engine_version: '1.1.0',
  smaWindow: 200,
  rocWindow: 252,
  slopeWindow: 20,
  percentileWindow: 504,
  ladder: { greenGreen: 1.0, oneRed: 0.5, redRed: 0.0 },
};

export interface RegimeTrendInput {
  close: number | null;
  sma200: number | null;
}

export interface RegimeVolInput {
  vixClose: number | null;
  vix3mClose: number | null;
}

export interface RegimeGateResult {
  trend_state: RegimeState;
  vol_state: RegimeState;
  /** null when either input state is UNKNOWN — never guess a multiplier for missing data. */
  risk_multiplier: number | null;
}

/** close > 200-day SMA -> GREEN, else RED. UNKNOWN if either input is missing. */
export function trendStateFromClose(close: number | null, sma200: number | null): RegimeState {
  if (close === null || sma200 === null) return 'UNKNOWN';
  return close > sma200 ? 'GREEN' : 'RED';
}

/** VIX < VIX3M (normal contango) -> GREEN, else RED (inverted term structure). UNKNOWN if missing. */
export function volStateFromVix(vixClose: number | null, vix3mClose: number | null): RegimeState {
  if (vixClose === null || vix3mClose === null) return 'UNKNOWN';
  return vixClose < vix3mClose ? 'GREEN' : 'RED';
}

/**
 * Combine trend + vol state into the four-cell ladder: GREEN+GREEN -> 1.0,
 * exactly one RED -> 0.5, RED+RED -> 0.0. UNKNOWN propagates: risk_multiplier
 * is null (not a guessed number) if either state is UNKNOWN.
 */
// ── Generic stats helpers backing regime_daily's backfill/daily-append ──────
// Deliberately self-contained (not imported from macro.ts) — see the module
// header. Closes are assumed oldest-first.

export function sma(closes: number[], window: number): number | null {
  if (closes.length < window) return null;
  return closes.slice(-window).reduce((a, b) => a + b, 0) / window;
}

/** Whether the close `window` trading days ago -> today's close is a net gain. */
export function rocPositive(closes: number[], window: number): boolean | null {
  if (closes.length < window + 1) return null;
  const past = closes[closes.length - 1 - window];
  const now = closes[closes.length - 1];
  if (past === 0) return null;
  return now > past;
}

/** Whether the `smaWindow`-day SMA is higher today than it was `slopeWindow` days ago. */
export function smaSlopePositive(closes: number[], smaWindow: number, slopeWindow: number): boolean | null {
  if (closes.length < smaWindow + slopeWindow) return null;
  const smaNow = sma(closes, smaWindow);
  const smaPast = sma(closes.slice(0, closes.length - slopeWindow), smaWindow);
  if (smaNow === null || smaPast === null) return null;
  return smaNow > smaPast;
}

/** Annualized realized volatility (stdev of daily log returns * sqrt(252)) over the trailing window. */
export function realizedVolAnnualized(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null;
  const slice = closes.slice(-(window + 1));
  const logReturns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] <= 0 || slice[i] <= 0) return null;
    logReturns.push(Math.log(slice[i] / slice[i - 1]));
  }
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / logReturns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/** Percentile rank (0-100) of `value` within `series` — % of series values at or below it. */
export function percentileRankOf(value: number, series: number[]): number | null {
  if (series.length === 0) return null;
  const below = series.filter((v) => v <= value).length;
  return (below / series.length) * 100;
}

export function regimeGate(
  trendRow: RegimeTrendInput,
  volFields: RegimeVolInput,
  config: RegimeGateConfig = REGIME_GATE_CONFIG,
): RegimeGateResult {
  const trend_state = trendStateFromClose(trendRow.close, trendRow.sma200);
  const vol_state = volStateFromVix(volFields.vixClose, volFields.vix3mClose);

  let risk_multiplier: number | null;
  if (trend_state === 'UNKNOWN' || vol_state === 'UNKNOWN') {
    risk_multiplier = null;
  } else if (trend_state === 'GREEN' && vol_state === 'GREEN') {
    risk_multiplier = config.ladder.greenGreen;
  } else if (trend_state === 'RED' && vol_state === 'RED') {
    risk_multiplier = config.ladder.redRed;
  } else {
    risk_multiplier = config.ladder.oneRed;
  }

  return { trend_state, vol_state, risk_multiplier };
}

/**
 * A user's REGIME_EXIT rule — the per-user advisory de-risking policy (host
 * decision 2026-07-08, replacing the single operator-owned docs/regime_exit_v0.md).
 * Values are magnitudes (percent). Stored on risk_config (migration 063).
 */
export interface RegimeExitRule {
  /** On a single-RED regime, trim each open position to this % of current size. */
  trimToPct: number;
  /** On a single-RED regime, the alternative action — tighten stops to this %. */
  stopPct: number;
  /** On a double-RED regime, reduce gross exposure to this %. */
  doubleRedGrossPct: number;
}

/**
 * The advisory de-risking guidance to show for a given regime gate result + the
 * user's own rule. Display-only — NEVER enforced on any order/sizing path (the
 * standing regime prohibition). Escalates with the gate:
 *   - all-clear (multiplier 1.0) or UNKNOWN → null (nothing to advise)
 *   - single RED (multiplier 0.5) → trim OR tighten-stops guidance
 *   - double RED (multiplier 0.0) → reduce-gross guidance (with the trim/stop fallback)
 * The caller renders this next to the mandatory "Advisory — not a trade signal" label.
 */
export function regimeExitAdvice(gate: RegimeGateResult, rule: RegimeExitRule): string | null {
  if (gate.risk_multiplier === null) return null;
  if (gate.trend_state === 'RED' && gate.vol_state === 'RED') {
    return `Reduce gross exposure to ${rule.doubleRedGrossPct}% — or trim each open position to ${rule.trimToPct}% / tighten stops to ${rule.stopPct}%.`;
  }
  if (gate.trend_state === 'RED' || gate.vol_state === 'RED') {
    return `Trim each open position to ${rule.trimToPct}% of current size, or tighten stops to ${rule.stopPct}%.`;
  }
  return null;
}
