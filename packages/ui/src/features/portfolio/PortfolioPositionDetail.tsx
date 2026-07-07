import { useMemo } from 'react';
import { regimeGate, sectorConcentration, formatDate, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, SPACE, RADIUS, type PositionInput } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useRiskConfig, useSectorMap } from '../limits/useRiskConfig';
import { useLatestRegime } from '../regime/useLatestRegime';
import type { UserPosition } from './api';

const STATE_COLOR: Record<'GREEN' | 'RED' | 'UNKNOWN', string> = {
  GREEN: 'var(--acc)',
  RED: 'var(--status-negative-text)',
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
  return n >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)';
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t2)', fontSize: FONT_SIZE.lg, cursor: 'pointer', padding: '2px 6px 2px 0' }}>←</button>
        )}
        <span style={{ fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.lg, color: 'var(--text)' }}>{group.underlying}</span>
        {group.conviction !== null && <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>STW conviction {group.conviction}</span>}
        {!isMobile && (
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--t3)', fontSize: FONT_SIZE.lg, cursor: 'pointer' }}>✕</button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: pad, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Position summary */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: SPACE[4] }}>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACE[2] }}>Your position</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{fmtMoney(group.marketValue)}</div>
              <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>Market value</div>
            </div>
            {showPnl && (
              <div>
                <div style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: pnlColor(group.netPnl) }}>{fmtMoney(group.netPnl)}</div>
                <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{group.returnPct !== null ? `Unrealized · ${fmtPct(group.returnPct)}` : 'Unrealized P&L'}</div>
              </div>
            )}
            {ownPortfolioPct !== null && (
              <div>
                <div style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{ownPortfolioPct.toFixed(1)}%</div>
                <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>of your book</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: SPACE[2.5], fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>
            {group.positions.length} leg{group.positions.length !== 1 ? 's' : ''}
            {group.hasStock && group.hasOption ? ' · Shares + options' : group.hasOption ? ' · Options only' : ' · Shares only'}
          </div>
        </div>

        {/* Tailing status */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: SPACE[4] }}>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACE[2] }}>Tailing status</div>
          {group.isTailed ? (
            <>
              <div style={{ fontSize: FONT_SIZE.base, color: 'var(--text)', marginBottom: SPACE[1.5] }}>
                Tailing <strong>{group.traders.join(', ')}</strong>
                {group.conviction !== null && <> · conviction {group.conviction}</>}
              </div>
              {ownPortfolioPct !== null && stwWeight !== null && (
                <div style={{ fontSize: FONT_SIZE.base, color: 'var(--t2)', marginBottom: SPACE[2.5], fontVariantNumeric: 'tabular-nums' }}>
                  You: <strong style={{ color: 'var(--text)' }}>{ownPortfolioPct.toFixed(1)}%</strong>
                  {' · '}STW: <strong style={{ color: 'var(--text)' }}>{stwWeight.toFixed(1)}%</strong>
                  {ownPortfolioPct - stwWeight > 0.5 && <span style={{ color: 'var(--status-warning-text)' }}> (you're sized larger)</span>}
                  {stwWeight - ownPortfolioPct > 0.5 && <span style={{ color: 'var(--status-warning-text)' }}> (you're sized smaller)</span>}
                </div>
              )}
              <button onClick={onViewStwPosition} style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)', background: 'none', border: '1px solid var(--c5b)', borderRadius: RADIUS.md, padding: '6px 12px', cursor: 'pointer' }}>
                View STW's tracked position →
              </button>
            </>
          ) : (
            <div style={{ fontSize: FONT_SIZE.base, color: 'var(--t3)' }}>Not currently tailing any tracked pick for {group.underlying}.</div>
          )}
        </div>

        {/* Limits / regime rollup */}
        {config && tickerViolation && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: SPACE[4] }}>
            <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACE[2] }}>This session's risk indicators</div>
            <div style={{ fontSize: FONT_SIZE.base, color: tickerViolation.positionBreach ? 'var(--status-negative-text)' : 'var(--t2)', marginBottom: 4 }}>
              Position concentration: {tickerViolation.posPct.toFixed(1)}% / {tickerViolation.maxPositionPct}%
              {tickerViolation.positionBreach ? ' — Breach' : ' — OK'}
            </div>
            <div style={{ fontSize: FONT_SIZE.base, color: 'var(--t2)', marginBottom: SPACE[2.5] }}>
              Sector: {tickerViolation.sector}{tickerViolation.sector === 'Unmapped' && ' (no sector data yet)'}
            </div>
            {regimeLoading ? null : gate ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>
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
              <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>No market regime data yet.</div>
            )}
            <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[2], fontStyle: 'italic' }}>
              Advisory — under forward validation. Not a trade signal.
            </div>
          </div>
        )}

        {/* P&L: Open (real) / Closed (no pipeline yet) */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: SPACE[4] }}>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACE[2] }}>P&L</div>
          <div style={{ marginBottom: SPACE[3] }}>
            <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t2)', marginBottom: SPACE[1.5] }}>Open</div>
            {group.positions.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT_SIZE.sm, padding: '4px 0', color: 'var(--t2)' }}>
                <span>{p.asset_class === 'OPT' ? `$${p.strike}${p.put_call}` : 'Shares'}</span>
                <span style={{ color: pnlColor(p.unrealized_pnl), fontVariantNumeric: 'tabular-nums' }}>
                  {p.unrealized_pnl !== null ? fmtMoney(p.unrealized_pnl) : '—'} {p.unrealized_pnl_pct !== null && `(${fmtPct(p.unrealized_pnl_pct)})`}
                </span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t2)', marginBottom: SPACE[1.5] }}>Closed</div>
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', fontStyle: 'italic' }}>
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
