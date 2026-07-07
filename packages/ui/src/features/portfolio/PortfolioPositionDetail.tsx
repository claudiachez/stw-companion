import { useMemo } from 'react';
import { regimeGate, sectorConcentration, formatDate, type PositionInput } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useRiskConfig, useSectorMap } from '../limits/useRiskConfig';
import { useLatestRegime } from '../regime/useLatestRegime';
import type { UserPosition } from './api';

const STATE_COLOR: Record<'GREEN' | 'RED' | 'UNKNOWN', string> = {
  GREEN: 'var(--acc)',
  RED: '#ef4444',
  UNKNOWN: 'var(--t3)',
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function pnlColor(n: number | null): string {
  if (n === null) return 'var(--t2)';
  return n >= 0 ? '#22c55e' : '#ef4444';
}

export interface DetailGroup {
  underlying: string;
  positions: UserPosition[];
  netPnl: number;
  returnPct: number | null;
  marketValue: number;
  isTailed: boolean;
  traders: string[];
  conviction: number | null;
  hasStock: boolean;
  hasOption: boolean;
}

/**
 * My Portfolio's own-position detail pane — replaces the old default of
 * navigating a ticker click straight to STW's tracked position (host
 * decision, 2026-07-06). Follows the same list+detail contract as
 * PicksView.tsx (desktop split pane / mobile full-screen swap owned by the
 * caller); this component is just the pane content.
 */
export function PortfolioPositionDetail({
  group, ownPortfolioPct, stwWeight, showPnl, onClose, onViewStwPosition,
}: {
  group: DetailGroup;
  /** This position's share of the subscriber's own book, by market value. */
  ownPortfolioPct: number | null;
  /** STW's own current_weight for this ticker, if tailed. */
  stwWeight: number | null;
  showPnl: boolean;
  onClose: () => void;
  onViewStwPosition: () => void;
}) {
  const isMobile = useIsMobile();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: config } = useRiskConfig(userId);
  const { data: sectorMap } = useSectorMap();
  const { data: regime, isLoading: regimeLoading } = useLatestRegime('IWM');

  const accountEquity = useMemo(
    () => group.positions.reduce((s, p) => s + Math.abs((p.quantity ?? 0) * (p.mark_price ?? 0) * p.multiplier), 0),
    [group.positions],
  );

  // Per-ticker rollup, reusing the same pure functions as the book-level ViolationsSummary
  // (packages/ui/src/features/limits/ViolationsSummary.tsx) — filtered to this ticker's own scope.
  const tickerViolation = useMemo(() => {
    if (!config) return null;
    const inputs: PositionInput[] = group.positions.map((p) => ({
      underlying: p.underlying, quantity: p.quantity, markPrice: p.mark_price, multiplier: p.multiplier,
    }));
    // accountEquity here is this ticker's own market value, not the whole book — so
    // positionConcentration's "% of X" would be meaningless at ticker scope. Instead
    // report this position's share of the whole book (ownPortfolioPct, passed in)
    // against the configured position limit, and its sector's book-wide standing.
    const posPct = ownPortfolioPct ?? 0;
    const positionBreach = posPct > config.max_position_pct;
    const sector = (sectorMap ?? {})[group.underlying] ?? 'Unmapped';
    const sectorRows = sectorConcentration(inputs, sectorMap ?? {}, accountEquity || 1, config.max_sector_pct);
    void sectorRows; // computed for parity/documentation; book-wide sector % needs the full book, not just this ticker
    return { posPct, positionBreach, sector, maxPositionPct: config.max_position_pct };
  }, [config, group, ownPortfolioPct, sectorMap, accountEquity]);

  const gate = regime ? regimeGate(
    { close: regime.close, sma200: regime.sma200 },
    { vixClose: regime.vix_close, vix3mClose: regime.vix3m_close },
  ) : null;

  const pad = isMobile ? '14px 12px' : '20px 24px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', flexShrink: 0 }}>
        {isMobile && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t2)', fontSize: 18, cursor: 'pointer', padding: '2px 6px 2px 0' }}>←</button>
        )}
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{group.underlying}</span>
        {group.conviction !== null && <span style={{ fontSize: 11, color: 'var(--t3)' }}>STW conviction {group.conviction}</span>}
        {!isMobile && (
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--t3)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: pad, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Position summary */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>Your position</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(group.marketValue)}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Market value</div>
            </div>
            {showPnl && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: pnlColor(group.netPnl) }}>{fmtMoney(group.netPnl)}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>{group.returnPct !== null ? `Unrealized · ${fmtPct(group.returnPct)}` : 'Unrealized P&L'}</div>
              </div>
            )}
            {ownPortfolioPct !== null && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{ownPortfolioPct.toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>of your book</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--t2)' }}>
            {group.positions.length} leg{group.positions.length !== 1 ? 's' : ''}
            {group.hasStock && group.hasOption ? ' · Shares + options' : group.hasOption ? ' · Options only' : ' · Shares only'}
          </div>
        </div>

        {/* Tailing status */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>Tailing status</div>
          {group.isTailed ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
                Tailing <strong>{group.traders.join(', ')}</strong>
                {group.conviction !== null && <> · conviction {group.conviction}</>}
              </div>
              {ownPortfolioPct !== null && stwWeight !== null && (
                <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 10, fontVariantNumeric: 'tabular-nums' }}>
                  You: <strong style={{ color: 'var(--text)' }}>{ownPortfolioPct.toFixed(1)}%</strong>
                  {' · '}STW: <strong style={{ color: 'var(--text)' }}>{stwWeight.toFixed(1)}%</strong>
                  {ownPortfolioPct - stwWeight > 0.5 && <span style={{ color: '#f59e0b' }}> (you're sized larger)</span>}
                  {stwWeight - ownPortfolioPct > 0.5 && <span style={{ color: '#f59e0b' }}> (you're sized smaller)</span>}
                </div>
              )}
              <button onClick={onViewStwPosition} style={{ fontSize: 12, fontWeight: 600, color: 'var(--acc)', background: 'none', border: '1px solid var(--c5b)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
                View STW's tracked position →
              </button>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>Not currently tailing any tracked pick for {group.underlying}.</div>
          )}
        </div>

        {/* Limits / regime rollup */}
        {config && tickerViolation && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>This session's risk indicators</div>
            <div style={{ fontSize: 13, color: tickerViolation.positionBreach ? '#ef4444' : 'var(--t2)', marginBottom: 4 }}>
              Position concentration: {tickerViolation.posPct.toFixed(1)}% / {tickerViolation.maxPositionPct}%
              {tickerViolation.positionBreach ? ' — Breach' : ' — OK'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 10 }}>
              Sector: {tickerViolation.sector}{tickerViolation.sector === 'Unmapped' && ' (no sector data yet)'}
            </div>
            {regimeLoading ? null : gate ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--t2)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLOR[gate.trend_state] }} />
                  Trend: {gate.trend_state}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLOR[gate.vol_state] }} />
                  Vol: {gate.vol_state}
                </span>
                {regime && <span style={{ color: 'var(--t3)' }}>as of {formatDate(regime.trading_date)}</span>}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>No market regime data yet.</div>
            )}
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 8, fontStyle: 'italic' }}>
              Advisory — under forward validation. Not a trade signal.
            </div>
          </div>
        )}

        {/* P&L: Open (real) / Closed (no pipeline yet) */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>P&L</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>Open</div>
            {group.positions.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', color: 'var(--t2)' }}>
                <span>{p.asset_class === 'OPT' ? `$${p.strike}${p.put_call}` : 'Shares'}</span>
                <span style={{ color: pnlColor(p.unrealized_pnl), fontVariantNumeric: 'tabular-nums' }}>
                  {p.unrealized_pnl !== null ? fmtMoney(p.unrealized_pnl) : '—'} {p.unrealized_pnl_pct !== null && `(${fmtPct(p.unrealized_pnl_pct)})`}
                </span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>Closed</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>
              Closed-position history — coming soon. Your IBKR sync currently only returns open
              positions; realized P&L on closed trades needs a separate data pipeline that hasn't
              been built yet.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
