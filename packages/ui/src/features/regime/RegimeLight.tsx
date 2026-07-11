import { regimeGate, regimeExitAdvice, formatDate, TREND_BUCKET_META, type RegimeExitRule, type TrendBucket } from '@stw/shared';
import { HelpToggle } from '../../primitives/HelpToggle';
import { useLatestRegime } from './useLatestRegime';

const STATE_COLOR: Record<'GREEN' | 'RED' | 'UNKNOWN', string> = {
  GREEN: 'var(--acc)',
  RED: 'var(--status-negative-text)',
  UNKNOWN: 'var(--t3)',
};

const BUCKET_COLOR: Record<TrendBucket, string> = {
  momentum: 'var(--c5)', healthy_pullback: 'var(--c5)', mid_caution: 'var(--c3)', bear_rally: 'var(--c3)', risk_off: 'var(--c1)',
};

/** The index's live 9/21/200 structure (from useTickerRegime), folded into this
 *  one card so it isn't a second near-identical block with a conflicting close. */
export interface RegimeStructure {
  bucket: TrendBucket | null;
  close: number | null;
  ma9: number | null;
  ma21: number | null;
  ma200: number | null;
}

/**
 * Advisory regime light — plans/integrity-guardrails.md Item 3. Presentational:
 * visibility is decided by the mount site (My Portfolio → Risk tab for subscribers,
 * apps/admin's LimitsPanel for the operator), NOT a gate in here.
 *
 * The GREEN/RED gate (trend + volatility + multiplier) comes from the frozen
 * regime engine over `regime_daily` (its own daily-close pipeline). The optional
 * `structure` is the index's LIVE 9/21/200 read (TwelveData) — when supplied it's
 * shown as the single close + MA set, so the two sources' slightly different
 * closes never appear side by side (they used to, in two separate cards). The
 * gate verdicts stay authoritative; the live structure is the finer texture.
 */
export function RegimeLight({ instrument = 'IWM', exitRule, structure }: {
  instrument?: string;
  exitRule?: RegimeExitRule;
  structure?: RegimeStructure | null;
}) {
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
  const hasStructure = !!structure && structure.bucket !== null && structure.close !== null;

  const maCell = (label: string, ma: number | null) => {
    if (ma === null || !structure) return <span className="text-t3">{label} —</span>;
    const above = (structure.close ?? 0) > ma;
    return <span style={{ color: above ? 'var(--c5)' : 'var(--c1)' }}>{label} {ma.toFixed(2)} {above ? '▲' : '▼'}</span>;
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-text font-semibold text-sm flex items-center gap-1.5">
          Regime light — {instrument}
          <HelpToggle ariaLabel="About the regime light">
            <span className="block">A read of the broad backdrop from {instrument}: the GREEN/RED gate (trend = price vs its 200-day average; volatility = VIX vs 3-month VIX) plus its finer 9/21/200 structure.</span>
            <span className="block text-t3 mt-1">GREEN = supportive, RED = fragile. The multiplier is a suggested size scale.</span>
            <span className="block text-t3 mt-1">The coarse <strong>200-day gate</strong> and the finer <strong>structure</strong> (e.g. "Healthy Pullback") are different lenses — a name can be in a healthy pullback while the 200-day backdrop is still GREEN.</span>
            <span className="block text-t3 mt-1">The gate is the frozen daily-close engine; the structure numbers are the live intraday read of the same index.</span>
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

      {hasStructure && structure ? (
        <>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-t3">Structure:</span>
            <span className="font-semibold" style={{ color: structure.bucket ? BUCKET_COLOR[structure.bucket] : 'var(--t3)' }}>
              {structure.bucket ? TREND_BUCKET_META[structure.bucket].label : '—'}
            </span>
          </div>
          <div className="text-t2 text-xs tabular-nums flex flex-wrap gap-x-3 gap-y-1">
            <span>Close {structure.close?.toFixed(2) ?? '—'}</span>
            {maCell('9MA', structure.ma9)}
            {maCell('21MA', structure.ma21)}
            {maCell('200MA', structure.ma200)}
            <span className="text-t3">· VIX {row.vix_close?.toFixed(2) ?? '—'} vs VIX3M {row.vix3m_close?.toFixed(2) ?? '—'}</span>
          </div>
        </>
      ) : (
        <div className="text-t3 text-xs tabular-nums">
          close {row.close?.toFixed(2) ?? '—'} vs 200SMA {row.sma200?.toFixed(2) ?? '—'}
          {' · '}VIX {row.vix_close?.toFixed(2) ?? '—'} vs VIX3M {row.vix3m_close?.toFixed(2) ?? '—'}
        </div>
      )}

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
