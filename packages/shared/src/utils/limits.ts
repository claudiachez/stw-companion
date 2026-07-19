/**
 * Risk limits engine — plans/integrity-guardrails.md Item 2.
 *
 * Pure functions only: positions + config in, violations out, zero global reads.
 * This is a FLAG-ONLY engine (standing prohibition, see the source spec) — nothing
 * here blocks an order or otherwise enforces a limit; it only reports breaches for
 * an operator/subscriber to act on.
 *
 * Exposure convention v1 (documented per the spec, not to be silently changed):
 * market value per position = `quantity × markPrice × multiplier`, using the
 * ABSOLUTE value (a short position still represents concentration/gross risk),
 * rolled up per `underlying`. Delta-notional (options-adjusted directional
 * exposure) is explicitly out of scope this round — see the spec's "out of
 * scope this week" list.
 *
 * `accountEquity` is passed in by the caller (there is no equity/cash column on
 * `user_positions` to derive it from) — this keeps the module pure and lets the
 * caller decide the baseline (e.g. IBKR NetLiquidation, or a configured value).
 */
import { isNonEquityBucket } from '../constants/sectors';

export interface PositionInput {
  underlying: string;
  quantity: number | null;
  markPrice: number | null;
  /** Contract multiplier; defaults to 1 for shares. Options should pass 100. */
  multiplier: number | null;
  /** True for an options leg — drives the separate option-concentration check. */
  isOption?: boolean;
}

export interface DrawdownStep {
  /** Negative — e.g. -10 means "10% down from the equity peak". */
  drawdownPct: number;
  /** Target gross exposure % once this step is breached. */
  targetGrossPct: number;
}

export interface RiskConfig {
  maxPositionPct: number;
  maxSectorPct: number;
  maxGrossPct: number;
  /** Separate, typically-tighter cap on any single underlying's OPTIONS exposure. */
  maxOptionPositionPct: number;
  ladder: DrawdownStep[];
}

/**
 * - `ok`          — comfortably under the limit.
 * - `near`        — ≥ 80% of the limit consumed (the actionable early-warning
 *                   tier; being AT the limit counts as near, not breach — a
 *                   100%/100% bar reads amber, never green).
 * - `breach`      — over the limit.
 * - `unevaluated` — the check couldn't be run (e.g. a position with no sector
 *                   mapping). This is MISSING DATA, not a violation — it must
 *                   never be counted as a breach (a permanent red flag trains
 *                   the operator to ignore the engine).
 */
export type ViolationSeverity = 'ok' | 'near' | 'breach' | 'unevaluated';

/** Fraction of a limit at/above which a check is flagged `near`. */
export const NEAR_LIMIT_FRACTION = 0.8;

/** Sector bucket for positions with no operator-supplied sector mapping. */
export const UNMAPPED_SECTOR = 'Unmapped';

export interface ConcentrationViolation {
  /** Underlying ticker, sector name, or 'GROSS' for the whole-book check. */
  scope: string;
  exposurePct: number;
  limitPct: number;
  severity: ViolationSeverity;
}

/** Market value of a single position leg — see the module header for the v1 convention. */
export function positionMarketValue(p: PositionInput): number {
  const qty = p.quantity ?? 0;
  const mark = p.markPrice ?? 0;
  const mult = p.multiplier ?? 1;
  return qty * mark * mult;
}

/** Absolute market value rolled up per underlying (options legs join their shares). */
export function rollupByUnderlying(positions: PositionInput[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of positions) {
    const mv = Math.abs(positionMarketValue(p));
    out[p.underlying] = (out[p.underlying] ?? 0) + mv;
  }
  return out;
}

/** Sum of absolute market value across the whole book — the gross exposure numerator. */
export function grossExposure(positions: PositionInput[]): number {
  return positions.reduce((sum, p) => sum + Math.abs(positionMarketValue(p)), 0);
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

/** ok → near (≥80% of limit, incl. at-limit) → breach (over limit). */
export function classifySeverity(exposurePct: number, limitPct: number): ViolationSeverity {
  if (exposurePct > limitPct) return 'breach';
  if (limitPct > 0 && exposurePct >= NEAR_LIMIT_FRACTION * limitPct) return 'near';
  return 'ok';
}

function toViolation(
  scope: string,
  exposurePct: number,
  limitPct: number,
  severity: ViolationSeverity = classifySeverity(exposurePct, limitPct),
): ConcentrationViolation {
  return { scope, exposurePct, limitPct, severity };
}

/** Per-underlying concentration vs `maxPositionPct`, one row per underlying held. */
export function positionConcentration(
  positions: PositionInput[],
  accountEquity: number,
  maxPositionPct: number,
): ConcentrationViolation[] {
  const byUnderlying = rollupByUnderlying(positions);
  return Object.entries(byUnderlying).map(([underlying, mv]) =>
    toViolation(underlying, pct(mv, accountEquity), maxPositionPct));
}

/**
 * Per-sector concentration vs `maxSectorPct`. `sectorMap` is the small
 * operator-editable ticker→sector table (NOT the live Finnhub-industry
 * algorithm in macro.ts — a different, unrelated system). Unmapped tickers
 * roll up under 'Unmapped' rather than being silently dropped.
 */
export function sectorConcentration(
  positions: PositionInput[],
  sectorMap: Record<string, string>,
  accountEquity: number,
  maxSectorPct: number,
): ConcentrationViolation[] {
  const bySector: Record<string, number> = {};
  for (const p of positions) {
    const sector = sectorMap[p.underlying] ?? UNMAPPED_SECTOR;
    // ETF / Cash are not an equity sector — exclude them from concentration
    // entirely (never a bucket, never 'unevaluated'), per the GICS taxonomy.
    if (isNonEquityBucket(sector)) continue;
    bySector[sector] = (bySector[sector] ?? 0) + Math.abs(positionMarketValue(p));
  }
  return Object.entries(bySector).map(([sector, mv]) =>
    // Unmapped is missing data, not a limit result — flag it 'unevaluated' so it's
    // never miscounted as a breach (§ risk-limits: unmapped ≠ violation).
    sector === UNMAPPED_SECTOR
      ? toViolation(sector, pct(mv, accountEquity), maxSectorPct, 'unevaluated')
      : toViolation(sector, pct(mv, accountEquity), maxSectorPct));
}

/**
 * Per-underlying OPTIONS concentration vs `maxOptionPositionPct` — rolls up only the
 * option legs (isOption) of each underlying. One row per underlying that holds options;
 * underlyings with no options don't appear (a share-only position isn't option risk).
 */
export function optionPositionConcentration(
  positions: PositionInput[],
  accountEquity: number,
  maxOptionPositionPct: number,
): ConcentrationViolation[] {
  const byUnderlying: Record<string, number> = {};
  for (const p of positions) {
    if (!p.isOption) continue;
    byUnderlying[p.underlying] = (byUnderlying[p.underlying] ?? 0) + Math.abs(positionMarketValue(p));
  }
  return Object.entries(byUnderlying).map(([underlying, mv]) =>
    toViolation(underlying, pct(mv, accountEquity), maxOptionPositionPct));
}

/** Whole-book gross exposure % vs `maxGrossPct` — always exactly one row, scope 'GROSS'. */
export function grossExposureViolation(
  positions: PositionInput[],
  accountEquity: number,
  maxGrossPct: number,
): ConcentrationViolation {
  return toViolation('GROSS', pct(grossExposure(positions), accountEquity), maxGrossPct);
}

/**
 * Resolve the target gross exposure % for the deepest drawdown-ladder step
 * breached. `drawdownPct` is negative (e.g. -12 = down 12% from the equity
 * peak). Returns null if no step is breached (no glide-path target applies).
 */
export function drawdownLadderTarget(ladder: DrawdownStep[], drawdownPct: number): number | null {
  let target: number | null = null;
  let deepest = Infinity;
  for (const step of ladder) {
    if (drawdownPct <= step.drawdownPct && step.drawdownPct < deepest) {
      deepest = step.drawdownPct;
      target = step.targetGrossPct;
    }
  }
  return target;
}

/**
 * Default "near" band for the drawdown ladder: the current drawdown is flagged
 * `near` (amber early warning) when it sits within this many percentage points of
 * the next, not-yet-breached rung. Distinct from NEAR_LIMIT_FRACTION (a % of the
 * limit, used by the concentration checks) — the ladder's rungs are absolute
 * drawdown levels, so proximity is measured in percentage points, not a ratio.
 * Host to confirm the band; 2pp is the plan's default (plans/20260719...).
 */
export const DRAWDOWN_NEAR_BAND_PP = 2;

export interface DrawdownLadderStatus {
  /** Current drawdown %, negative (mirrors the input; 0 = at the high-water mark). */
  drawdownPct: number;
  /** The deepest rung currently breached, or null if none is breached. */
  activeStep: DrawdownStep | null;
  /** The next, not-yet-breached (deeper) rung, or null once the deepest rung is breached. */
  nextStep: DrawdownStep | null;
  /** Percentage points from the current drawdown to `nextStep`'s threshold (positive =
   *  still above it). Null when there's no next rung. */
  distanceToNextPp: number | null;
  /** `breach` if any rung is breached; else `near` within the band of the next rung; else `ok`.
   *  Never `unevaluated` — a null drawdown is handled by the caller (renders nothing). */
  severity: ViolationSeverity;
}

/**
 * The always-on drawdown read for the Risk tab (plans/20260719 Item 1) — turns a bare
 * drawdown % into "where am I on the ladder?": the deepest rung breached (if any), the
 * next rung ahead, how far off it is, and a `ok|near|breach` severity so a NEAR reads
 * amber BEFORE a rung fires (the whole point — the ladder was silent until it fired).
 *
 * `drawdownPct` is negative (e.g. -8.85 = down 8.85% from the cash-flow-adjusted peak).
 * Rungs are absolute drawdown levels (e.g. -10, -15), so proximity is measured in
 * percentage points against `nearBandPp`, NOT as a fraction of a limit.
 */
export function drawdownLadderStatus(
  ladder: DrawdownStep[],
  drawdownPct: number,
  nearBandPp: number = DRAWDOWN_NEAR_BAND_PP,
): DrawdownLadderStatus {
  // Shallowest → deepest (e.g. -10 before -15) so the first unbreached rung we hit is
  // the nearest one ahead, and the last breached one we see is the deepest active.
  const sorted = [...ladder].sort((a, b) => b.drawdownPct - a.drawdownPct);
  let activeStep: DrawdownStep | null = null;
  let nextStep: DrawdownStep | null = null;
  for (const step of sorted) {
    if (drawdownPct <= step.drawdownPct) activeStep = step;
    else if (nextStep === null) nextStep = step;
  }
  const distanceToNextPp = nextStep === null ? null : drawdownPct - nextStep.drawdownPct;
  let severity: ViolationSeverity = 'ok';
  if (activeStep !== null) severity = 'breach';
  else if (distanceToNextPp !== null && distanceToNextPp <= nearBandPp) severity = 'near';
  return { drawdownPct, activeStep, nextStep, distanceToNextPp, severity };
}

/**
 * Cash-flow-adjusted drawdown-from-peak, in percent (0 = at the high-water mark,
 * negative = below it). Returns null when there isn't enough real data to compute
 * a drawdown (no live equity, or no established peak) — the caller renders NOTHING
 * in that case rather than a phantom number.
 *
 * Drawdown is measured NET OF EXTERNAL CASH FLOWS so a deposit/withdrawal — which
 * moves NLV without being a gain or loss — is not mistaken for one. The peak is a
 * raw NLV high-water mark (`equityPeak`) paired with the cumulative cash flow AS OF
 * that high (`equityPeakCashflow`, maintained by fn_risk_config_track_equity_peak);
 * only the flow SINCE the peak is applied, by re-basing the peak to "now":
 *   peakAdjustedToNow = equityPeak + (cumulativeCashflow − equityPeakCashflow)
 *   drawdownPct       = (nlv − peakAdjustedToNow) / peakAdjustedToNow × 100
 * A net deposit since the peak RAISES the bar (more capital to protect); a net
 * withdrawal LOWERS it. This is a first-order (additive) adjustment, not full
 * time-weighted return — good enough for an advisory de-risk trigger.
 *
 * See migration 071 for the full rationale + the storage model.
 */
export function cashflowAdjustedDrawdownPct(
  nlv: number | null,
  equityPeak: number | null,
  cumulativeCashflow: number | null,
  equityPeakCashflow: number | null,
): number | null {
  if (nlv === null || equityPeak === null) return null;
  const flowsSincePeak = (cumulativeCashflow ?? 0) - (equityPeakCashflow ?? 0);
  const peakAdjustedToNow = equityPeak + flowsSincePeak;
  if (peakAdjustedToNow <= 0) return null;
  return ((nlv - peakAdjustedToNow) / peakAdjustedToNow) * 100;
}

/**
 * The two independent de-risking triggers both cap the same lever — gross exposure:
 *   - the drawdown ladder (keyed to YOUR account drawdown) → `ladderPct`
 *   - the double-RED regime rule (keyed to the MARKET gate) → `regimePct`
 * Each is null when not currently firing. When BOTH fire (common — a crash usually
 * causes a drawdown too), the BINDING target is the tighter (lower) one — you obey the
 * most conservative. This is the single reconciliation both surfaces (the gross-exposure
 * card and the regime light) render, so they never show two different numbers.
 * Returns null when neither is active (nothing to de-risk to).
 */
export interface BindingGrossTarget {
  /** The governing target % — the lower of the two when both apply. */
  targetPct: number;
  /** Drawdown-ladder target %, or null if no rung is breached. */
  ladderPct: number | null;
  /** Double-RED regime target %, or null if the regime isn't double-RED. */
  regimePct: number | null;
  /** Which trigger(s) are active — drives the copy. */
  source: 'ladder' | 'regime' | 'both';
}

export function bindingGrossTarget(
  ladderPct: number | null,
  regimePct: number | null,
): BindingGrossTarget | null {
  if (ladderPct !== null && regimePct !== null) {
    return { targetPct: Math.min(ladderPct, regimePct), ladderPct, regimePct, source: 'both' };
  }
  if (ladderPct !== null) return { targetPct: ladderPct, ladderPct, regimePct: null, source: 'ladder' };
  if (regimePct !== null) return { targetPct: regimePct, ladderPct: null, regimePct, source: 'regime' };
  return null;
}

/** Runs all three concentration checks + the drawdown ladder in one call. */
export function evaluateRiskConfig(
  positions: PositionInput[],
  sectorMap: Record<string, string>,
  accountEquity: number,
  config: RiskConfig,
  drawdownPct: number | null,
): {
  positionViolations: ConcentrationViolation[];
  optionViolations: ConcentrationViolation[];
  sectorViolations: ConcentrationViolation[];
  grossViolation: ConcentrationViolation;
  ladderTargetGrossPct: number | null;
} {
  return {
    positionViolations: positionConcentration(positions, accountEquity, config.maxPositionPct),
    optionViolations: optionPositionConcentration(positions, accountEquity, config.maxOptionPositionPct),
    sectorViolations: sectorConcentration(positions, sectorMap, accountEquity, config.maxSectorPct),
    grossViolation: grossExposureViolation(positions, accountEquity, config.maxGrossPct),
    ladderTargetGrossPct: drawdownPct === null ? null : drawdownLadderTarget(config.ladder, drawdownPct),
  };
}
