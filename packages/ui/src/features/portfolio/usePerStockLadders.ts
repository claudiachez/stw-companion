import { useMemo } from 'react';
import {
  perStockLadderStatus, reconstructPositionEpisode, DEFAULT_PER_STOCK_LADDER,
  DEFAULT_PER_STOCK_OPTION_LADDER, DRAWDOWN_NEAR_BAND_PP,
  type PerStockLadderStatus, type PositionFill,
} from '@stw/shared';
import { usePriceCacheStore } from '../../store/priceCache';
import { cleanUnderlying, type UserPosition, type UserExecution } from './api';
import type { RiskConfigRow } from '../limits/api';

export interface PerStockLadderInfo {
  status: PerStockLadderStatus;
  /** Live Finnhub price when cached, else the synced IBKR stock mark. */
  currentPrice: number;
  priceIsLive: boolean;
  avgCost: number;
  /** Signed current share count (summed across STK legs of the underlying). */
  currentQty: number;
  /** |peak| size reconstructed from fills, or null when history is incomplete. */
  peakQty: number | null;
  /** True when the reconstructed fill history doesn't reconcile with the live snapshot —
   *  pre-window/pre-sync fills are missing, so we can't confirm how much has been trimmed. */
  historyIncomplete: boolean;
}

// Shares are whole numbers but fills/positions are numeric; a small tolerance guards the
// reconstructed-vs-snapshot reconciliation against float dust.
const RECONCILE_TOL = 1e-3;

/**
 * Per-stock drawdown-ladder status for every held STOCK position (plans/20260719 Item 4).
 *
 * Drawdown from entry = (live price − avg_cost)/avg_cost — live-priced like the rest of the
 * overhaul (Finnhub when cached, the synced mark on fallback). The reduce-to-peak compliance
 * needs the position's peak size, which the snapshot can't carry, so we reconstruct it from
 * the append-only `user_executions` log (`reconstructPositionEpisode`) and reconcile the
 * running quantity against the live snapshot — a mismatch means missing history, and we
 * surface it as "incomplete" (peak unknown) rather than trusting a half-seen peak.
 *
 * Keyed by cleaned underlying; only names with a real long/short position and a usable
 * avg_cost appear. Advisory/display-only.
 *
 * `assetClass` selects BOTH the positions/fills evaluated AND the ladder used: shares
 * (`STK`) are judged against `per_stock_ladder`, options (`OPT`) against the separate,
 * faster-cutting `per_stock_option_ladder` (migration 078) — the deferred honoring of the
 * two-ladder Settings model. The shared `perStockLadderStatus` is already ladder-agnostic
 * (it takes the ladder as an argument), so only the ladder + position filter change here.
 */
export function usePerStockLadders(
  positions: UserPosition[],
  executions: UserExecution[],
  config: RiskConfigRow | null | undefined,
  assetClass: 'STK' | 'OPT' = 'STK',
): Map<string, PerStockLadderInfo> {
  const cache = usePriceCacheStore((s) => s.cache);
  const ladder = assetClass === 'OPT'
    ? (config?.per_stock_option_ladder ?? DEFAULT_PER_STOCK_OPTION_LADDER)
    : (config?.per_stock_ladder ?? DEFAULT_PER_STOCK_LADDER);
  const nearBand = config?.drawdown_near_band_pp ?? DRAWDOWN_NEAR_BAND_PP;

  return useMemo(() => {
    const out = new Map<string, PerStockLadderInfo>();
    if (!ladder.length) return out;

    // Fills per underlying for the chosen asset class, for peak reconstruction.
    const fillsByUnderlying = new Map<string, PositionFill[]>();
    for (const e of executions) {
      if (e.asset_class !== assetClass) continue;
      const u = cleanUnderlying(e.underlying);
      if (!fillsByUnderlying.has(u)) fillsByUnderlying.set(u, []);
      fillsByUnderlying.get(u)!.push({ quantity: e.quantity, executedAt: e.executed_at });
    }

    // Aggregate legs of the chosen asset class per underlying (options of different
    // strikes/expiries on one name roll up together, mirroring the stock-lot rollup).
    const stk = new Map<string, { qty: number; costWeighted: number; absQty: number; mark: number | null }>();
    for (const p of positions) {
      if (p.asset_class !== assetClass) continue;
      const u = cleanUnderlying(p.underlying);
      const qty = p.quantity ?? 0;
      if (qty === 0 || p.avg_cost == null) continue;
      const agg = stk.get(u) ?? { qty: 0, costWeighted: 0, absQty: 0, mark: p.mark_price };
      agg.qty += qty;
      agg.costWeighted += p.avg_cost * Math.abs(qty);
      agg.absQty += Math.abs(qty);
      agg.mark = p.mark_price ?? agg.mark;
      stk.set(u, agg);
    }

    for (const [u, agg] of stk) {
      if (agg.absQty === 0) continue;
      const avgCost = agg.costWeighted / agg.absQty;
      if (avgCost <= 0) continue;
      const live = cache[u]?.c ?? null;
      const priceIsLive = live !== null;
      const currentPrice = live ?? agg.mark ?? avgCost;
      const drawdownPct = ((currentPrice - avgCost) / avgCost) * 100;

      const episode = reconstructPositionEpisode(fillsByUnderlying.get(u) ?? []);
      const reconciles = episode.hasOpenEpisode
        && Math.abs(episode.reconstructedQty - agg.qty) <= RECONCILE_TOL;
      const peakQty = reconciles ? episode.peakQty : null;

      const status = perStockLadderStatus(drawdownPct, agg.qty, peakQty ?? 0, ladder, nearBand);
      out.set(u, {
        status,
        currentPrice,
        priceIsLive,
        avgCost,
        currentQty: agg.qty,
        peakQty,
        historyIncomplete: !reconciles,
      });
    }
    return out;
  }, [positions, executions, cache, ladder, nearBand, assetClass]);
}
