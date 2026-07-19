/**
 * Live Net Liquidation Value for the DRAWDOWN READ ONLY (plans/20260719 Item 2).
 *
 * The drawdown ladder should track what the user is staring at — live Finnhub prices —
 * not the last IBKR sync. Rather than re-price the whole book (option legs have no live
 * quote), we adjust the settled `ibkr_nlv` by only the marks that have moved since the
 * sync:
 *
 *   liveNlv = ibkr_nlv + Σ (livePrice − syncedMark) · signedQty · multiplier
 *
 * over stock legs that have a live quote. Option legs and unquoted names contribute a
 * zero delta (they keep their synced mark), so cash/margin and everything unpriced falls
 * out exactly. Signed quantity is used so a short position moves the NLV the right way.
 *
 * This is a DELIBERATE, host-signed-off exception (2026-07-19) to "account equity =
 * risk_config.ibkr_nlv": it drives the current-drawdown READ for responsiveness, NOT the
 * equity denominator for the concentration limits (that stays `ibkr_nlv`) and NOT the
 * `equity_peak` (a settled high-water off the synced NLV — see migration 071). Falls back
 * to the synced `ibkr_nlv` (isLive=false) when no live quote is available (market closed
 * / uncached), so the read degrades to the last sync, never to nothing.
 */

export interface LivePositionMark {
  /** Asset class from `user_positions` — only 'STK' legs are re-priced (no live option quotes). */
  assetClass: string;
  /** Underlying ticker, already cleaned to the base symbol (the price-cache key). */
  underlying: string;
  quantity: number | null;
  /** The mark from the last IBKR sync (`user_positions.mark_price`). */
  syncedMark: number | null;
  /** Contract multiplier (1 for shares). */
  multiplier: number | null;
}

export interface LiveNlvResult {
  /** Live NLV, the synced `ibkr_nlv` fallback, or null when there's no synced NLV to base off. */
  nlv: number | null;
  /** True when at least one stock leg was re-priced from a live quote (else it's the pure synced value). */
  isLive: boolean;
}

export function liveNlvFromMarks(
  syncedNlv: number | null,
  positions: LivePositionMark[],
  livePrice: (underlying: string) => number | null,
): LiveNlvResult {
  if (syncedNlv === null) return { nlv: null, isLive: false };
  let delta = 0;
  let isLive = false;
  for (const p of positions) {
    if (p.assetClass !== 'STK') continue; // options: no live underlying-priced mark
    const lp = livePrice(p.underlying);
    if (lp === null || p.syncedMark === null) continue;
    const qty = p.quantity ?? 0;
    const mult = p.multiplier ?? 1;
    delta += (lp - p.syncedMark) * qty * mult;
    isLive = true;
  }
  return { nlv: syncedNlv + delta, isLive };
}
