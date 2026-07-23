import {
  regimeGate, cashflowAdjustedDrawdownPct, drawdownLadderTarget, bindingGrossTarget,
  type BindingGrossTarget,
} from '@stw/shared';
import { useLatestRegimeLive } from '../regime/useLatestRegimeLive';
import type { RiskConfigRow } from './api';

/**
 * The single reconciliation of the two independent de-risking triggers into ONE
 * governing gross-exposure target, so the gross-exposure card and the regime light
 * never show two different numbers (host, 2026-07-12 — "Option 2").
 *
 *   - Drawdown ladder (YOUR account drawdown) → the deepest breached rung's target.
 *     Drawdown is measured net of cash flows off the live NLV vs its adjusted peak
 *     (migration 071); null (no target) until real NLV + peak exist.
 *   - Double-RED regime rule (the MARKET gate on `instrument`) → the config's
 *     double-RED gross target, active ONLY when both trend AND volatility are RED.
 *
 * When both fire the tighter (lower) target binds. Both surfaces call THIS hook with
 * the same config + instrument, so they compute the identical result — the
 * reconciliation lives in one place, not two renderers.
 *
 * `liveNlv` (plans/20260719 Item 2) overrides the NLV used for the DRAWDOWN read so the
 * ladder target tracks live prices, matching the "Portfolio drawdown" card. Pass it from
 * the composition root's `useLiveNlv` (web). Omit it (admin, no live quotes) to read off
 * the synced `ibkr_nlv` — the settled fallback. The equity denominator + peak are
 * unchanged either way.
 */
export function useBindingGrossTarget(
  config: RiskConfigRow | null | undefined,
  instrument: string,
  liveNlv?: number | null,
): BindingGrossTarget | null {
  // Must run unconditionally (hook rule) — the config guard comes after.
  const { data: row } = useLatestRegimeLive(instrument);
  if (!config) return null;

  // `undefined` = no live feed (admin) → synced NLV; a passed value (incl. null) wins.
  const nlvForDrawdown = liveNlv !== undefined ? liveNlv : config.ibkr_nlv;
  const drawdownPct = cashflowAdjustedDrawdownPct(
    nlvForDrawdown, config.equity_peak, config.cumulative_cashflow, config.equity_peak_cashflow,
  );
  const ladderPct = drawdownPct === null ? null : drawdownLadderTarget(config.ladder, drawdownPct);

  const gate = row
    ? regimeGate({ close: row.close, sma200: row.sma200 }, { vixClose: row.vix_close, vix3mClose: row.vix3m_close })
    : null;
  const regimePct = gate && gate.trend_state === 'RED' && gate.vol_state === 'RED'
    ? config.regime_doublered_gross_pct
    : null;

  return bindingGrossTarget(ladderPct, regimePct);
}
