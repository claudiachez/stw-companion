import { regimeGate, formatDate } from '@stw/shared';
import { useCapabilities } from '../../context/AppCapabilities';
import { useLatestRegime } from './useLatestRegime';

const STATE_COLOR: Record<'GREEN' | 'RED' | 'UNKNOWN', string> = {
  GREEN: 'var(--acc)',
  RED: 'var(--status-negative-text)',
  UNKNOWN: 'var(--t3)',
};

/**
 * Advisory regime light — plans/integrity-guardrails.md Item 3. Admin-only
 * (`isAdmin` capability gate, matching the repo convention for admin-only
 * action hints). Shows STW's own proxy instrument (traders.regime_proxy) by
 * default. Purely informational: nothing here places, blocks, or adjusts an
 * order — see docs/REGIME_EXIT_v0.md for the operator's own manual playbook.
 */
export function RegimeLight({ instrument = 'IWM' }: { instrument?: string }) {
  const { isAdmin } = useCapabilities();
  const { data: row, isLoading } = useLatestRegime(instrument);

  if (!isAdmin) return null;
  if (isLoading) return null;

  if (!row) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 text-t3 text-xs">
        No regime_daily data yet for {instrument} — run the backfill (Item 3) first.
      </div>
    );
  }

  const gate = regimeGate(
    { close: row.close, sma200: row.sma200 },
    { vixClose: row.vix_close, vix3mClose: row.vix3m_close },
  );

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-text font-semibold text-sm">Regime light — {instrument}</span>
        <span className="text-t3 text-[10px]">{formatDate(row.trading_date)}</span>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATE_COLOR[gate.trend_state] }} />
          <span className="text-t2 text-xs">Trend: {gate.trend_state}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATE_COLOR[gate.vol_state] }} />
          <span className="text-t2 text-xs">Vol: {gate.vol_state}</span>
        </div>
        <span className="text-text text-xs font-mono font-semibold">
          Multiplier: {gate.risk_multiplier === null ? '—' : gate.risk_multiplier.toFixed(1)}
        </span>
      </div>

      <div className="text-t3 text-xs font-mono">
        close {row.close?.toFixed(2) ?? '—'} vs 200SMA {row.sma200?.toFixed(2) ?? '—'}
        {' · '}VIX {row.vix_close?.toFixed(2) ?? '—'} vs VIX3M {row.vix3m_close?.toFixed(2) ?? '—'}
      </div>

      <div className="text-[10px] uppercase tracking-wide font-semibold text-[var(--status-warning-text)]">
        Advisory — under forward validation. Not a trade signal.
      </div>
    </div>
  );
}
