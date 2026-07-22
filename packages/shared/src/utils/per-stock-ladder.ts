/**
 * Per-stock drawdown LADDER (plans/20260719 Item 4) — the per-name protection the
 * account ladder can't give: a single position down hard from entry (TE −32%) never
 * moves an account-level drawdown enough to trip it.
 *
 * A DIFFERENT axis from the account ladder + the market-regime rule: those two cap GROSS
 * EXPOSURE and reconcile via `bindingGrossTarget` ("tightest binds"); this flags/targets a
 * single NAME and sets no gross target, so it structurally cannot contradict them.
 * Advisory/display-only, like everything in the risk engine.
 *
 * Trigger  = drawdown-from-entry `(mark − avgCost)/avgCost` (stable — a trim doesn't change
 *            the remaining shares' average cost).
 * Action   = reduce-to a fraction of your PEAK size at each rung (host: "trim ¼ each" →
 *            hold ≤ 75/50/25/0 %). To know how much you've ALREADY trimmed we reconstruct
 *            the peak from the append-only `user_executions` fill log (see
 *            `reconstructPositionEpisode`) — so a rung goes quiet once you've complied,
 *            instead of nagging.
 */
import type { ViolationSeverity } from './limits';
import { DRAWDOWN_NEAR_BAND_PP } from './limits';

export interface PerStockDrawdownStep {
  /** Negative — drawdown from entry at which this rung applies (e.g. -10 = down 10%). */
  drawdownPct: number;
  /** Reduce-to target: hold at most this % of your PEAK position size (0 = exit). */
  holdFractionPct: number;
}

/** Default per-stock ladder (host 2026-07-19): trim a quarter of peak at each step, exit by −20%. */
export const DEFAULT_PER_STOCK_LADDER: PerStockDrawdownStep[] = [
  { drawdownPct: -5, holdFractionPct: 75 },
  { drawdownPct: -10, holdFractionPct: 50 },
  { drawdownPct: -15, holdFractionPct: 25 },
  { drawdownPct: -20, holdFractionPct: 0 },
];

/** Default per-OPTION ladder (2026-07-20 Settings redesign): options move faster, so this
 *  ladder starts deeper but cuts sooner than the stock ladder. Same shape/semantics. */
export const DEFAULT_PER_STOCK_OPTION_LADDER: PerStockDrawdownStep[] = [
  { drawdownPct: -20, holdFractionPct: 50 },
  { drawdownPct: -30, holdFractionPct: 25 },
  { drawdownPct: -40, holdFractionPct: 0 },
];

// ── peak reconstruction from the fill log ─────────────────────────────────────

/** One fill from `user_executions` — signed quantity (BUY > 0, SELL < 0) + when. */
export interface PositionFill {
  quantity: number | null;
  /** ISO instant; used only to order fills chronologically. */
  executedAt: string;
}

export interface PositionEpisode {
  /** True when the position is currently open (the running quantity ended non-zero). */
  hasOpenEpisode: boolean;
  /** |peak| quantity reached during the CURRENT open episode (0 if closed/none). A prior,
   *  fully-closed episode's size never counts — a re-entry starts a fresh peak. */
  peakQty: number;
  /** Signed quantity of the fill that opened the current episode (0 if none). */
  entryQty: number;
  /** Signed running quantity after the last fill — reconcile against the snapshot to detect
   *  missing pre-window history (the Flex lookback slides; early fills are unrecoverable). */
  reconstructedQty: number;
}

// Share counts are effectively integers, but fills are `numeric` (fractional shares exist),
// so treat a running total this close to zero as a flat/closed position.
const FLAT_EPS = 1e-6;

/**
 * Reconstruct the CURRENT open episode's peak size by walking the fill log for ONE
 * underlying. An episode runs from a flat book (running = 0) to the next time it returns
 * flat; a close-then-reopen therefore resets the peak, so a name you exited and re-bought
 * is measured from its new size, never last year's.
 *
 * Missing pre-window fills surface as `reconstructedQty` not matching the live snapshot —
 * the caller falls back to peak = current size ("history incomplete") rather than trusting
 * a peak built from a half-seen history.
 */
export function reconstructPositionEpisode(fills: PositionFill[]): PositionEpisode {
  const sorted = [...fills].sort((a, b) => (a.executedAt < b.executedAt ? -1 : a.executedAt > b.executedAt ? 1 : 0));
  let running = 0;
  let peak = 0;
  let entryQty = 0;
  let open = false;
  for (const f of sorted) {
    const qty = f.quantity ?? 0;
    if (qty === 0) continue;
    if (!open && Math.abs(running) < FLAT_EPS) {
      // Opening a fresh episode from a flat book — reset the peak to this fill's size.
      open = true;
      entryQty = qty;
      peak = 0;
    }
    running += qty;
    if (open) peak = Math.max(peak, Math.abs(running));
    if (Math.abs(running) < FLAT_EPS) open = false; // returned flat → episode closed
  }
  return open
    ? { hasOpenEpisode: true, peakQty: peak, entryQty, reconstructedQty: running }
    : { hasOpenEpisode: false, peakQty: 0, entryQty: 0, reconstructedQty: 0 };
}

// ── ladder status ─────────────────────────────────────────────────────────────

export interface PerStockLadderStatus {
  /** Drawdown from entry %, negative. */
  drawdownPct: number;
  /** Deepest rung breached, or null if none. */
  activeRung: PerStockDrawdownStep | null;
  /** Next, not-yet-breached (deeper) rung, or null once the deepest is breached. */
  nextRung: PerStockDrawdownStep | null;
  /** Percentage points to `nextRung`'s threshold (positive = still above it), or null. */
  distanceToNextPp: number | null;
  /** ok | near (within the band of the next rung, OR a satisfied active rung near the next)
   *  | breach (past a rung and NOT yet trimmed to its target, incl. unverifiable history). */
  severity: ViolationSeverity;
  /** Reduce-to target of the active rung (% of peak), or null when no rung is active. */
  targetHoldPct: number | null;
  /** How much you currently hold vs your peak (% ), or null when the peak is unknown/incomplete. */
  currentHoldPct: number | null;
  /** Whether you've already trimmed to the active rung's target. Null = can't verify (no peak
   *  / incomplete fill history) — treated as NOT complied for severity, so risk isn't hidden. */
  alreadyComplies: boolean | null;
}

/**
 * Where a single position sits on its per-stock ladder. Idempotent by design: once you've
 * trimmed to the active rung's target (`alreadyComplies`), that rung stops reading `breach`
 * — it won't nag, and Item 3 alerts key off the same signal so they don't cry wolf.
 *
 * `currentQty`/`peakQty` are the SIGNED live quantity and the |peak| from
 * `reconstructPositionEpisode`. Pass `peakQty <= 0` (or an unreconciled peak) to mean
 * "peak unknown" → compliance is null and an active rung reads `breach` (surface, don't hide).
 */
export function perStockLadderStatus(
  drawdownPct: number,
  currentQty: number,
  peakQty: number,
  ladder: PerStockDrawdownStep[],
  nearBandPp: number = DRAWDOWN_NEAR_BAND_PP,
): PerStockLadderStatus {
  const sorted = [...ladder].sort((a, b) => b.drawdownPct - a.drawdownPct);
  let activeRung: PerStockDrawdownStep | null = null;
  let nextRung: PerStockDrawdownStep | null = null;
  for (const rung of sorted) {
    if (drawdownPct <= rung.drawdownPct) activeRung = rung;
    else if (nextRung === null) nextRung = rung;
  }
  const distanceToNextPp = nextRung === null ? null : drawdownPct - nextRung.drawdownPct;

  const peakKnown = peakQty > FLAT_EPS;
  const currentHoldPct = peakKnown ? (Math.abs(currentQty) / peakQty) * 100 : null;
  const targetHoldPct = activeRung ? activeRung.holdFractionPct : null;
  const alreadyComplies = activeRung === null
    ? null
    : currentHoldPct === null
      ? null // peak unknown → can't verify
      : currentHoldPct <= activeRung.holdFractionPct + FLAT_EPS;

  const nearNext = distanceToNextPp !== null && distanceToNextPp <= nearBandPp;
  let severity: ViolationSeverity;
  if (activeRung === null) {
    severity = nearNext ? 'near' : 'ok';
  } else if (alreadyComplies === true) {
    // Rung satisfied (you've trimmed to target) → not a breach; only amber if the NEXT rung looms.
    severity = nearNext ? 'near' : 'ok';
  } else {
    severity = 'breach'; // past a rung and not (verifiably) trimmed to it
  }

  return { drawdownPct, activeRung, nextRung, distanceToNextPp, severity, targetHoldPct, currentHoldPct, alreadyComplies };
}
