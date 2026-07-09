/**
 * Vol-targeted position sizing scalar — Week-2 Item 3
 * (plans/20260709_integrity-guardrailsv2.md).
 *
 * The institutional replacement for gate-as-permission: instead of a discrete
 * on/off/half multiplier, scale position size inversely to realized volatility so
 * the *risk contribution* of a position stays roughly constant. When realized vol
 * is below target, size up (toward the cap); when it spikes above target, size
 * down (toward the floor).
 *
 * DISPLAY-ONLY, consumed by nothing (standing prohibition: nothing enforces a
 * sizing multiplier on any order path until Phase B). It renders in the admin
 * Risk panel beside the regime light as a candidate — its adoption is decided at
 * Phase B by the backtest evidence (Week-2 Item 3 validation + Item 4 depth), not
 * now, and not in code.
 *
 * Units: `realizedVol20d` and `targetVol` must share units. regime_daily stores
 * `rv20_annualized` as an annualized PERCENT (stdev of daily log returns ×
 * √252 × 100 — see realizedVolAnnualized in regime.ts), so the defaults here are
 * likewise in annualized-percent terms.
 */

export interface VolTargetConfig {
  /** Target annualized realized vol, in percent (e.g. 15 = 15%). */
  targetVol: number;
  /** Maximum scalar — never lever a low-vol name past this. */
  cap: number;
  /** Minimum scalar — never shrink a high-vol name below this. */
  floor: number;
}

export const DEFAULT_VOL_TARGET_CONFIG: VolTargetConfig = {
  targetVol: 15,
  cap: 1.5,
  floor: 0.3,
};

/**
 * scalar = targetVol / realizedVol20d, clamped to [floor, cap].
 *
 * Returns null when inputs are missing or unusable (non-positive realized vol,
 * non-positive target) — never a guessed 1.0, mirroring the regime gate's
 * "null, not a fabricated number, for missing data" discipline.
 */
export function volTargetScalar(
  realizedVol20d: number | null | undefined,
  targetVol: number = DEFAULT_VOL_TARGET_CONFIG.targetVol,
  cap: number = DEFAULT_VOL_TARGET_CONFIG.cap,
  floor: number = DEFAULT_VOL_TARGET_CONFIG.floor,
): number | null {
  if (realizedVol20d === null || realizedVol20d === undefined) return null;
  if (!(realizedVol20d > 0) || !(targetVol > 0)) return null;
  const raw = targetVol / realizedVol20d;
  return Math.min(cap, Math.max(floor, raw));
}
