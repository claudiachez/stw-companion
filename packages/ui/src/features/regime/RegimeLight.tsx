import { regimeGate, regimeExitAdvice, formatDate, type RegimeExitRule } from '@stw/shared';
import { HelpToggle } from '../../primitives/HelpToggle';
import { useLatestRegime } from './useLatestRegime';

const STATE_COLOR: Record<'GREEN' | 'RED' | 'UNKNOWN', string> = {
  GREEN: 'var(--acc)',
  RED: 'var(--status-negative-text)',
  UNKNOWN: 'var(--t3)',
};

/**
 * Advisory regime light — plans/integrity-guardrails.md Item 3. Presentational:
 * visibility is decided by the mount site (My Portfolio → Risk tab for subscribers,
 * apps/admin's LimitsPanel for the operator), NOT a gate in here. Shows STW's proxy
 * instrument (traders.regime_proxy) by default, and — when `exitRule` is supplied
 * and the regime is RED — the viewer's OWN REGIME_EXIT de-risking rule (per-user,
 * migration 063). Purely informational: nothing here places, blocks, or adjusts an
 * order (the standing regime prohibition).
 */
export function RegimeLight({ instrument = 'IWM', exitRule }: { instrument?: string; exitRule?: RegimeExitRule }) {
  const { data: row, isLoading } = useLatestRegime(instrument);

  if (isLoading) return null;

  if (!row) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 text-t3 text-xs">
        No market regime data yet.
      </div>
    );
  }

  const gate = regimeGate(
    { close: row.close, sma200: row.sma200 },
    { vixClose: row.vix_close, vix3mClose: row.vix3m_close },
  );
  const advice = exitRule ? regimeExitAdvice(gate, exitRule) : null;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-text font-semibold text-sm flex items-center gap-1.5">
          Regime light — {instrument}
          <HelpToggle ariaLabel="About the regime light">
            <span className="block">A two-part read of the broad backdrop from {instrument}: trend (price vs its 200-day average) and volatility (VIX vs 3-month VIX).</span>
            <span className="block text-t3 mt-1">GREEN = supportive, RED = fragile. The multiplier is a suggested size scale.</span>
            <span className="block text-t3 mt-1">This coarse <strong>200-day</strong> read is separate from a ticker's finer 9/21/200 structure badge (e.g. "Healthy Pullback") — a name can be in a healthy pullback while the 200-day backdrop is still GREEN.</span>
            <span className="block text-t3 mt-1">Advisory only — nothing here places or blocks a trade. When RED, your own REGIME_EXIT rule (set in Settings) suggests how to de-risk.</span>
          </HelpToggle>
        </span>
        <span className="text-t3 text-[10px]">{formatDate(row.trading_date)}</span>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATE_COLOR[gate.trend_state] }} />
          <span className="text-t2 text-xs">Trend (200D): {gate.trend_state}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATE_COLOR[gate.vol_state] }} />
          <span className="text-t2 text-xs">Volatility: {gate.vol_state}</span>
        </div>
        <span className="text-text text-xs tabular-nums font-semibold">
          Multiplier: {gate.risk_multiplier === null ? '—' : gate.risk_multiplier.toFixed(1)}
        </span>
      </div>

      {/* tabular-nums (not monospace) — same numeric treatment as the % pairs on
          the Risk tab, so the styling difference isn't just incidental. */}
      <div className="text-t3 text-xs tabular-nums">
        close {row.close?.toFixed(2) ?? '—'} vs 200SMA {row.sma200?.toFixed(2) ?? '—'}
        {' · '}VIX {row.vix_close?.toFixed(2) ?? '—'} vs VIX3M {row.vix3m_close?.toFixed(2) ?? '—'}
      </div>

      {advice && (
        <div
          className="text-t2 text-xs"
          style={{ borderLeft: '2px solid var(--status-warning-text)', paddingLeft: 8 }}
        >
          Your rule: {advice}
        </div>
      )}

      {/* Disclaimer, set apart with a divider + spacing so it reads as a different
          kind of statement, not one more data line. */}
      <div className="text-[10px] uppercase tracking-wide font-semibold text-[var(--status-warning-text)] mt-1 pt-3 border-t border-bsub">
        Advisory — under forward validation. Not a trade signal.
      </div>
    </div>
  );
}
