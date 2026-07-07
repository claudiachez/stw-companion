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

export interface PositionInput {
  underlying: string;
  quantity: number | null;
  markPrice: number | null;
  /** Contract multiplier; defaults to 1 for shares. Options should pass 100. */
  multiplier: number | null;
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
  ladder: DrawdownStep[];
}

export type ViolationSeverity = 'ok' | 'breach';

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

function toViolation(scope: string, exposurePct: number, limitPct: number): ConcentrationViolation {
  return { scope, exposurePct, limitPct, severity: exposurePct > limitPct ? 'breach' : 'ok' };
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
    const sector = sectorMap[p.underlying] ?? 'Unmapped';
    bySector[sector] = (bySector[sector] ?? 0) + Math.abs(positionMarketValue(p));
  }
  return Object.entries(bySector).map(([sector, mv]) =>
    toViolation(sector, pct(mv, accountEquity), maxSectorPct));
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

/** Runs all three concentration checks + the drawdown ladder in one call. */
export function evaluateRiskConfig(
  positions: PositionInput[],
  sectorMap: Record<string, string>,
  accountEquity: number,
  config: RiskConfig,
  drawdownPct: number | null,
): {
  positionViolations: ConcentrationViolation[];
  sectorViolations: ConcentrationViolation[];
  grossViolation: ConcentrationViolation;
  ladderTargetGrossPct: number | null;
} {
  return {
    positionViolations: positionConcentration(positions, accountEquity, config.maxPositionPct),
    sectorViolations: sectorConcentration(positions, sectorMap, accountEquity, config.maxSectorPct),
    grossViolation: grossExposureViolation(positions, accountEquity, config.maxGrossPct),
    ladderTargetGrossPct: drawdownPct === null ? null : drawdownLadderTarget(config.ladder, drawdownPct),
  };
}
