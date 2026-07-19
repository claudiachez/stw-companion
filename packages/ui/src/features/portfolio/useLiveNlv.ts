import { useMemo } from 'react';
import { liveNlvFromMarks } from '@stw/shared';
import { usePriceCacheStore } from '../../store/priceCache';
import { cleanUnderlying, type UserPosition } from './api';
import type { RiskConfigRow } from '../limits/api';

export interface LiveNlv {
  /** Live NLV for the drawdown READ, the synced `ibkr_nlv` fallback, or null when neither exists. */
  nlv: number | null;
  /** True when at least one stock leg was re-priced from a live Finnhub quote. */
  isLive: boolean;
  /** As-of stamp: the most recent contributing Finnhub quote time when live, else `ibkr_nlv_at`. */
  asOf: string | null;
  /** The settled synced NLV (`ibkr_nlv`) + its stamp — the fallback and the % denominator. */
  syncedNlv: number | null;
  syncedAt: string | null;
}

/**
 * Live NLV for the drawdown ladder (plans/20260719 Item 2, Option A) — reads the shared
 * Finnhub price cache (populated by `useLiveQuotes`) and adjusts the synced `ibkr_nlv` by
 * only the stock marks that have moved (`liveNlvFromMarks`). Drives the current-drawdown
 * READ, never the equity denominator or the peak (host-signed-off exception — see
 * docs/decisions.md). Falls back to the synced NLV when no quote is cached.
 *
 * Compute this ONCE at the composition root (`PortfolioPage`) and thread the result into
 * both `ViolationsSummary` and `useBindingGrossTarget`, so the card % and the ladder→gross
 * binding target read the same live NLV (one source, never two live computations).
 */
export function useLiveNlv(
  config: RiskConfigRow | null | undefined,
  positions: UserPosition[],
): LiveNlv {
  const cache = usePriceCacheStore((s) => s.cache);
  const syncedNlv = config?.ibkr_nlv ?? null;
  const syncedAt = config?.ibkr_nlv_at ?? null;

  return useMemo(() => {
    const marks = positions.map((p) => ({
      assetClass: p.asset_class,
      underlying: cleanUnderlying(p.underlying),
      quantity: p.quantity,
      syncedMark: p.mark_price,
      multiplier: p.multiplier,
    }));
    const { nlv, isLive } = liveNlvFromMarks(syncedNlv, marks, (u) => cache[u]?.c ?? null);

    // As-of = the freshest quote that actually contributed (a stock leg with a live price).
    let latestTs = 0;
    if (isLive) {
      for (const p of positions) {
        if (p.asset_class !== 'STK') continue;
        const q = cache[cleanUnderlying(p.underlying)];
        if (q?.c && q.t > latestTs) latestTs = q.t;
      }
    }
    const asOf = isLive && latestTs ? new Date(latestTs * 1000).toISOString() : syncedAt;

    return { nlv, isLive, asOf, syncedNlv, syncedAt };
  }, [cache, positions, syncedNlv, syncedAt]);
}
