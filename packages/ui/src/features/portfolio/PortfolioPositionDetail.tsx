import { regimeGate, classifySeverity, formatDate, FONT_SIZE, FONT_WEIGHT, SPACE, RADIUS, type ViolationSeverity } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { DetailPane, DetailPaneMetricLabel } from '../../primitives/DetailPane';
import { Badge } from '../../primitives/Badge';
import { StatusPill } from '../../primitives/StatusPill';
import { EmptyState } from '../../primitives/EmptyState';
import { useRiskConfig, useSectorMap } from '../limits/useRiskConfig';
import { useLatestRegime } from '../regime/useLatestRegime';
import type { UserPosition } from './api';

const STATE_COLOR: Record<'GREEN' | 'RED' | 'UNKNOWN', string> = {
  GREEN: 'var(--acc)',
  RED: 'var(--status-negative-text)',
  UNKNOWN: 'var(--t3)',
};

const SEVERITY_LABEL: Record<ViolationSeverity, string> = {
  ok: 'OK', near: 'Near', breach: 'Breach', unevaluated: 'Unevaluated',
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
  /** STW's company name + basket for the header/badge strip, if this ticker is tailed. */
  companyName: string | null;
  basket: string | null;
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.lg, padding: SPACE[4], marginBottom: SPACE[3] }}>
      <DetailPaneMetricLabel>{title}</DetailPaneMetricLabel>
      <div style={{ marginTop: SPACE[2] }}>{children}</div>
    </div>
  );
}

/**
 * My Portfolio's own-position detail pane — now an instance of the shared DetailPane
 * (same component family as the Stock Picks / ADEA pane): header + badge strip, a 3-col
 * metric block (Your Position / Open P&L / Weight-drift), then stacked section cards.
 * Ticker-click default is this pane, not STW's tracked position (host, 2026-07-06) —
 * STW's view is an explicit link inside the Tailing section.
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

  const gate = regime ? regimeGate(
    { close: regime.close, sma200: regime.sma200 },
    { vixClose: regime.vix_close, vix3mClose: regime.vix3m_close },
  ) : null;

  const legCount = group.positions.length;
  const composition = group.hasStock && group.hasOption ? 'Shares + options' : group.hasOption ? 'Options only' : 'Shares only';

  // Position concentration vs the configured cap, scored with the SAME tiering as the
  // Risk tab (ok / near / breach) — measured as this position's share of the whole book.
  const posPct = ownPortfolioPct ?? 0;
  const posSeverity: ViolationSeverity | null = config ? classifySeverity(posPct, config.max_position_pct) : null;
  const sector = (sectorMap ?? {})[group.underlying] ?? null;

  const sizeDelta = ownPortfolioPct !== null && stwWeight !== null ? ownPortfolioPct - stwWeight : null;

  const badges = (
    <>
      {group.basket && <Badge kind="category" category={group.basket} />}
      {group.conviction !== null && <Badge kind="tier" tier={group.conviction} />}
      {group.isTailed && group.traders.map((t) => <Badge key={t} kind="source" trader={t} />)}
    </>
  );

  const metrics = [
    {
      key: 'position',
      content: (
        <>
          <DetailPaneMetricLabel>Your Position</DetailPaneMetricLabel>
          <div style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', lineHeight: 1.1 }}>{fmtMoney(group.marketValue)}</div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[0.5] }}>
            market value{ownPortfolioPct !== null ? ` · ${ownPortfolioPct.toFixed(1)}% of book` : ''}
          </div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', marginTop: SPACE[1.5] }}>{legCount} leg{legCount !== 1 ? 's' : ''} · {composition}</div>
        </>
      ),
    },
    {
      key: 'pnl',
      content: (
        <>
          <DetailPaneMetricLabel>Open P&L</DetailPaneMetricLabel>
          {showPnl ? (
            <>
              <div style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: pnlColor(group.netPnl), lineHeight: 1.1 }}>{fmtMoney(group.netPnl)}</div>
              <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[0.5] }}>
                unrealized{group.returnPct !== null ? ` · ${fmtPct(group.returnPct)}` : ''}
              </div>
            </>
          ) : (
            <div style={{ fontSize: FONT_SIZE.base, color: 'var(--t3)' }}>Hidden</div>
          )}
        </>
      ),
    },
    {
      key: 'weight',
      content: (
        <>
          <DetailPaneMetricLabel>Weight vs STW</DetailPaneMetricLabel>
          <div style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', lineHeight: 1.1 }}>
            {ownPortfolioPct !== null ? `${ownPortfolioPct.toFixed(1)}%` : '—'}
          </div>
          {group.isTailed && stwWeight !== null && sizeDelta !== null ? (
            <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[0.5] }}>
              you · STW {stwWeight.toFixed(1)}%
              {Math.abs(sizeDelta) > 0.5 && (
                <span style={{ color: 'var(--status-warning-text)' }}> · {sizeDelta > 0 ? '+' : ''}{sizeDelta.toFixed(1)}% {sizeDelta > 0 ? 'oversized' : 'undersized'}</span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[0.5] }}>of your book</div>
          )}
        </>
      ),
    },
  ];

  return (
    <DetailPane
      title={group.underlying}
      subtitle={group.companyName ?? composition}
      badges={badges}
      metrics={metrics}
      isMobile={isMobile}
      onClose={onClose}
    >
      {/* Tailing */}
      <Section title="Tailing">
        {group.isTailed ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2], alignItems: 'flex-start' }}>
            <div style={{ fontSize: FONT_SIZE.base, color: 'var(--text)' }}>
              Tailing <strong>{group.traders.join(', ')}</strong>
              {group.conviction !== null && <span style={{ color: 'var(--t2)' }}> · STW conviction {group.conviction}</span>}
            </div>
            <button onClick={onViewStwPosition} style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)', background: 'none', border: '1px solid var(--c5b)', borderRadius: RADIUS.md, padding: '6px 12px', cursor: 'pointer' }}>
              View STW's tracked position →
            </button>
          </div>
        ) : (
          <div style={{ fontSize: FONT_SIZE.base, color: 'var(--t3)' }}>Not currently tailing any tracked pick for {group.underlying}.</div>
        )}
      </Section>

      {/* Risk indicators — same OK/NEAR/BREACH pill vocabulary as the Risk tab */}
      {config && (
        <Section title="Risk indicators">
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap', marginBottom: SPACE[2] }}>
            <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>Position concentration</span>
            <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{posPct.toFixed(1)}% / {config.max_position_pct}%</span>
            {posSeverity && <StatusPill variant={posSeverity}>{SEVERITY_LABEL[posSeverity]}</StatusPill>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap', marginBottom: SPACE[2] }}>
            <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>Sector</span>
            {sector
              ? <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--text)' }}>{sector}</span>
              : <><span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>no sector data yet</span><StatusPill variant="unevaluated">Unevaluated</StatusPill></>}
          </div>
          {regimeLoading ? null : gate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>
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
        </Section>
      )}

      {/* P&L — Shares / Options breakdown (Open) + a standard coming-soon empty state (Closed) */}
      <Section title="P&L">
        <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t2)', marginBottom: SPACE[1.5] }}>Open</div>
        {showPnl ? group.positions.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT_SIZE.sm, padding: '4px 0', color: 'var(--t2)' }}>
            <span>{p.asset_class === 'OPT' ? `$${p.strike}${p.put_call} ${p.expiry ?? ''}`.trim() : 'Shares'}</span>
            <span style={{ color: pnlColor(p.unrealized_pnl), fontVariantNumeric: 'tabular-nums' }}>
              {p.unrealized_pnl !== null ? fmtMoney(p.unrealized_pnl) : '—'} {p.unrealized_pnl_pct !== null && `(${fmtPct(p.unrealized_pnl_pct)})`}
            </span>
          </div>
        )) : <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>Hidden</div>}
        <div style={{ borderTop: '1px solid var(--bsub)', marginTop: SPACE[3], paddingTop: SPACE[2] }}>
          <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t2)', marginBottom: SPACE[1] }}>Closed</div>
          <EmptyState
            icon="⏳"
            message="Closed-position history — coming soon. Your IBKR sync currently returns open positions only."
          />
        </div>
      </Section>
    </DetailPane>
  );
}
