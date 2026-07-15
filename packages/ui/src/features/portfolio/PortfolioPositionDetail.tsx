import { regimeGate, regimeExitAdvice, classifySeverity, formatDate, fmtDateTime, sizingTone, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, SPACE, RADIUS, type ViolationSeverity } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { DetailPane, DetailPaneMetricLabel } from '../../primitives/DetailPane';
import { Badge } from '../../primitives/Badge';
import { StatusPill } from '../../primitives/StatusPill';
import { EmptyState } from '../../primitives/EmptyState';
import { useRiskConfig, useSectorMap } from '../limits/useRiskConfig';
import { useLatestRegime } from '../regime/useLatestRegime';
import { useRegimeInstrumentStore } from '../regime/useRegimeInstrument';
import { RegimeBadge } from '../picks/components/RegimeBadge';
import { useEarningsCalendar } from '../earnings/useEarningsCalendar';
import { EarningsBadge } from '../earnings/EarningsBadge';
import type { TickerRegime } from '../picks/useTickerRegime';
import { useUserExecutions } from './useUserPositions';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** IBKR 'yyyyMMdd' → "Jan 15 '27"; passes through anything not in that shape. */
function fmtExpiry(e: string | null): string {
  if (!e || !/^\d{8}$/.test(e)) return e ?? '';
  return `${MONTHS[+e.slice(4, 6) - 1]} ${+e.slice(6, 8)} '${e.slice(2, 4)}`;
}
/** "Shares" or "$12.5C Jan 15 '27" — used by both the P&L breakdown and the ledger. */
function instrumentLabel(x: { asset_class: string; strike: number | null; put_call: string | null; expiry: string | null }): string {
  if (x.asset_class === 'OPT' && x.strike != null && x.put_call) {
    const exp = fmtExpiry(x.expiry);
    return `$${x.strike}${x.put_call}${exp ? ` ${exp}` : ''}`;
  }
  return 'Shares';
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
  group, ownPortfolioPct, stwWeight, showPnl, tickerRegime, onClose, onViewStwPosition,
}: {
  group: DetailGroup;
  /** This position's share of the subscriber's own book, by market value. */
  ownPortfolioPct: number | null;
  /** STW's own current_weight for this ticker, if tailed. */
  stwWeight: number | null;
  showPnl: boolean;
  /** The ticker's own trend structure + sector-rotation standing (computed once at the page level). */
  tickerRegime?: TickerRegime;
  onClose: () => void;
  onViewStwPosition: () => void;
}) {
  const isMobile = useIsMobile();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: config } = useRiskConfig(userId);
  const { data: sectorMap } = useSectorMap();
  const regimeInstrument = useRegimeInstrumentStore((s) => s.instrument);
  const { data: regime, isLoading: regimeLoading } = useLatestRegime(regimeInstrument);

  const gate = regime ? regimeGate(
    { close: regime.close, sma200: regime.sma200 },
    { vixClose: regime.vix_close, vix3mClose: regime.vix3m_close },
  ) : null;
  const regimeAdvice = gate && config ? regimeExitAdvice(gate, {
    trimToPct: config.regime_trim_to_pct, stopPct: config.regime_stop_pct, doubleRedGrossPct: config.regime_doublered_gross_pct,
  }) : null;

  const legCount = group.positions.length;
  const composition = group.hasStock && group.hasOption ? 'Shares + options' : group.hasOption ? 'Options only' : 'Shares only';

  // Position concentration vs the configured cap, scored with the SAME tiering as the
  // Risk tab (ok / near / breach) — measured as this position's share of the whole book.
  const posPct = ownPortfolioPct ?? 0;
  const posSeverity: ViolationSeverity | null = config ? classifySeverity(posPct, config.max_position_pct) : null;
  const sector = (sectorMap ?? {})[group.underlying] ?? null;
  const { getNext: getNextEarnings } = useEarningsCalendar();
  const nextEarnings = getNextEarnings(group.underlying);
  const { data: allExecutions } = useUserExecutions();
  const execs = (allExecutions ?? []).filter((x) => x.underlying?.toUpperCase() === group.underlying.toUpperCase());

  const sizeDelta = ownPortfolioPct !== null && stwWeight !== null ? ownPortfolioPct - stwWeight : null;

  // Header badges = the ticker's market SECTOR (universal to the position) + its own
  // technical read: trend structure + sector-rotation standing (RegimeBadge), the same
  // two chips the Stock Picks detail shows. The tailed-pick info (trader / basket /
  // conviction / sizing) stays in the Tailing section, not the header (host, 2026-07-08).
  const badges = (sector || tickerRegime || nextEarnings) ? (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {sector && (
        <span style={{
          fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label,
          textTransform: 'uppercase', color: 'var(--t2)', background: 'var(--s2)',
          border: '1px solid var(--border)', borderRadius: RADIUS.DEFAULT, padding: '2px 6px', whiteSpace: 'nowrap',
        }}>{sector}</span>
      )}
      <RegimeBadge regime={tickerRegime} />
      {nextEarnings && <EarningsBadge event={nextEarnings} />}
    </span>
  ) : null;

  const tone = sizingTone(sizeDelta);

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
          <DetailPaneMetricLabel>Weight</DetailPaneMetricLabel>
          <div style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', lineHeight: 1.1 }}>
            {ownPortfolioPct !== null ? `${ownPortfolioPct.toFixed(1)}%` : '—'}
          </div>
          {/* STW comparison lives in the Tailing section now — this stays a clean book %. */}
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[0.5] }}>of your book</div>
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
      {/* Tailing — all the tailed-pick info on one line (trader · basket · conviction ·
          your-vs-trader sizing) with a compact link icon to STW's tracked position, so
          nothing about the pick is scattered into the header (host, 2026-07-08). */}
      <Section title="Tailing">
        {group.isTailed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap' }}>
            {group.traders.map((t) => <Badge key={t} kind="source" trader={t} />)}
            {group.basket && <Badge kind="category" category={group.basket} />}
            {group.conviction !== null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE[1] }}>
                <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>Conviction {group.conviction}</span>
                <Badge kind="tier" tier={group.conviction} />
              </span>
            )}
            {stwWeight !== null && (
              <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
                You {ownPortfolioPct !== null ? `${ownPortfolioPct.toFixed(1)}%` : '—'} · STW {stwWeight.toFixed(1)}%
                {tone.state !== 'inline' && <span style={{ color: tone.textVar, fontWeight: FONT_WEIGHT.semibold }}> · {tone.label}</span>}
              </span>
            )}
            <button
              onClick={onViewStwPosition}
              title="View STW's tracked position"
              aria-label="View STW's tracked position"
              style={{
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, flexShrink: 0, borderRadius: RADIUS.md,
                border: '1px solid var(--c5b)', background: 'none', color: 'var(--acc)', cursor: 'pointer', fontSize: FONT_SIZE.base,
              }}
            >
              ↗
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
                Trend (200D): {gate.trend_state}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLOR[gate.vol_state] }} />
                Volatility: {gate.vol_state}
              </span>
              {regime && <span style={{ color: 'var(--t3)' }}>as of {formatDate(regime.trading_date)}</span>}
            </div>
          ) : (
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>No market regime data yet.</div>
          )}
          {regimeAdvice && (
            <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', marginTop: SPACE[1.5], borderLeft: '2px solid var(--status-warning-text)', paddingLeft: SPACE[2] }}>
              Your rule: {regimeAdvice}
            </div>
          )}
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[2], fontStyle: 'italic' }}>
            Advisory — under forward validation. Not a trade signal.
          </div>
        </Section>
      )}

      {/* P&L — Shares / Options breakdown for the OPEN legs, each showing its cost
          basis (avg entry → current mark) alongside the unrealized return. */}
      <Section title="P&L">
        <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t2)', marginBottom: SPACE[1.5] }}>Open</div>
        {showPnl ? group.positions.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: SPACE[2], fontSize: FONT_SIZE.sm, padding: '4px 0', color: 'var(--t2)' }}>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span>{instrumentLabel(p)}</span>
              <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
                {p.quantity !== null ? `${Math.abs(p.quantity)} @ ` : ''}avg {p.avg_cost !== null ? `$${p.avg_cost.toFixed(2)}` : '—'}
                {p.mark_price !== null ? ` · mark $${p.mark_price.toFixed(2)}` : ''}
              </span>
            </span>
            <span style={{ color: pnlColor(p.unrealized_pnl), fontVariantNumeric: 'tabular-nums', alignSelf: 'flex-start' }}>
              {p.unrealized_pnl !== null ? fmtMoney(p.unrealized_pnl) : '—'} {p.unrealized_pnl_pct !== null && `(${fmtPct(p.unrealized_pnl_pct)})`}
            </span>
          </div>
        )) : <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>Hidden</div>}
      </Section>

      {/* Transaction History — the user's OWN fills for this ticker (user_executions),
          the same dated-ledger idea as Stock Picks' Transaction History. Read-only;
          newest-first. Covers buys AND sells, so it also surfaces closed/trimmed legs. */}
      <Section title="Transaction History">
        {execs.length === 0 ? (
          <EmptyState
            icon="🧾"
            message="No synced fills for this position yet. Import your IBKR trade history from Settings to see your transactions here."
          />
        ) : (
          <div>
            {execs.map((x) => (
              <div key={x.id} style={{ display: 'flex', alignItems: 'baseline', gap: SPACE[2], flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--bsub)', fontSize: FONT_SIZE.sm }}>
                <span style={{ fontWeight: FONT_WEIGHT.semibold, color: x.side === 'SELL' ? 'var(--pnl-loss)' : 'var(--acc)', minWidth: 30 }}>
                  {x.side === 'SELL' ? 'Sell' : 'Buy'}
                </span>
                <span style={{ color: 'var(--text)' }}>{instrumentLabel(x)}</span>
                <span style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
                  {x.quantity !== null ? Math.abs(x.quantity) : '—'} @ {x.price !== null ? `$${x.price.toFixed(2)}` : '—'}
                </span>
                <span style={{ marginLeft: 'auto', color: 'var(--t3)' }}>{fmtDateTime(x.executed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </DetailPane>
  );
}
