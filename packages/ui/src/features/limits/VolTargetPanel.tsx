import { volTargetScalar, formatDate } from '@stw/shared';
import { useLatestRegime } from '../regime/useLatestRegime';
import type { RiskConfigRow } from './api';

/**
 * Vol-targeted sizing scalar — Week-2 Item 3
 * (plans/20260709_integrity-guardrailsv2.md). DISPLAY-ONLY, consumed by nothing:
 * the institutional candidate to replace gate-as-permission at Phase B, shown in
 * the admin Risk panel beside the regime light. Nothing here places, blocks, or
 * adjusts an order (the standing regime prohibition).
 *
 * scalar = vol_target_pct / rv20_annualized, clamped to [floor, cap]. Inputs come
 * from the latest regime_daily row for the proxy instrument. The validation
 * backtest (return / vol / drawdown / Sharpe vs. unscaled) is pending the
 * regime_daily depth extension (Week-2 Item 4) — until it lands we show the live
 * scalar and label the evidence as pending rather than fabricate numbers.
 */
export function VolTargetPanel({ config, instrument = 'IWM' }: { config: RiskConfigRow; instrument?: string }) {
  const { data: row, isLoading } = useLatestRegime(instrument);
  if (isLoading) return null;

  const rv20 = row?.rv20_annualized ?? null;
  const scalar = volTargetScalar(rv20, config.vol_target_pct, config.vol_target_cap, config.vol_target_floor);

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-text font-semibold text-sm">Vol-targeted sizing — {instrument}</span>
        {row && <span className="text-t3 text-[10px]">{formatDate(row.trading_date)}</span>}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-text text-xl font-mono font-semibold">
          {scalar === null ? '—' : `${scalar.toFixed(2)}×`}
        </span>
        <span className="text-t2 text-xs">
          target {config.vol_target_pct.toFixed(0)}% · realized{' '}
          {rv20 === null ? '—' : `${rv20.toFixed(1)}%`}
        </span>
      </div>

      <div className="text-t3 text-xs font-mono">
        scalar = {config.vol_target_pct.toFixed(0)}% ÷ {rv20 === null ? '—' : `${rv20.toFixed(1)}%`}
        {' '}(cap {config.vol_target_cap.toFixed(1)} · floor {config.vol_target_floor.toFixed(1)})
      </div>

      <div className="text-t3 text-xs">
        Validation backtest pending the regime history depth extension (Week-2 Item 4).
      </div>

      <div className="text-[10px] uppercase tracking-wide font-semibold text-[var(--status-warning-text)]">
        Advisory candidate — not applied to any position. Consumed by nothing.
      </div>
    </div>
  );
}
