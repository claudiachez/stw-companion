import { regimeGate, regimeExitAdvice, classifySeverity, formatDate, fmtDateTime, fmtOptionExpiry, sizingTone, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, SPACE, RADIUS, type ViolationSeverity } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useQuote } from '../../hooks/useLivePrice';
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
import { PerStockLadderDetail } from './PerStockLadder';
import type { PerStockLadderInfo } from './usePerStockLadders';
import type { UserPosition, UserExecution } from './api';

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

/** "Shares" or "$12.5C Jan 15 '27". Delegates the date to the shared `fmtOptionExpiry`
 *  (the predefined expiry format) after converting IBKR's 'yyyyMMdd' to its YYYY-MM-DD input. */
function instrumentLabel(x: { asset_class: string; strike: number | null; put_call: string | null; expiry: string | null }): string {
  if (x.asset_class === 'OPT' && x.strike != null && x.put_call) {
    const dashed = x.expiry && /^\d{8}$/.test(x.expiry) ? `${x.expiry.slice(0, 4)}-${x.expiry.slice(4, 6)}-${x.expiry.slice(6, 8)}` : x.expiry;
    const exp = fmtOptionExpiry(dashed, true);
    return `$${x.strike}${x.put_call}${exp ? ` ${exp}` : ''}`;
  }
  return 'Shares';
}

interface ExecGroup {
  key: string;
  label: string;
  fills: UserExecution[]; // newest-first
  netQty: number;
  realized: number;       // Σ proceeds + Σ commission — exact realized P&L once closed
  costBasis: number;      // total cash paid on buys (for the return %)
  closed: boolean;
}

/**
 * Group fills into the position they belong to (one option contract, or all shares of
 * the underlying) so the ledger answers "what happened", not just "what filled". A
 * closed group's realized P&L is proceeds-exact (Σ proceeds + Σ commission); an open
 * group's Σ proceeds still carries the cost of held units, so we show status only there
 * and leave the live number to the P&L section above.
 */
function buildExecGroups(execs: UserExecution[]): ExecGroup[] {
  const map = new Map<string, UserExecution[]>();
  for (const x of execs) {
    const key = x.asset_class === 'OPT' ? x.symbol : `${x.underlying}:STK`;
    const arr = map.get(key);
    if (arr) arr.push(x); else map.set(key, [x]);
  }
  const groups: ExecGroup[] = [];
  for (const [key, fills] of map) {
    const netQty = fills.reduce((s, f) => s + (f.quantity ?? 0), 0);
    const realized = fills.reduce((s, f) => s + (f.proceeds ?? 0) + (f.commission ?? 0), 0);
    const costBasis = fills.reduce((s, f) => s + Math.max(0, -(f.proceeds ?? 0)), 0);
    groups.push({ key, label: instrumentLabel(fills[0]), fills, netQty, realized, costBasis, closed: Math.abs(netQty) < 1e-6 });
  }
  return groups.sort((a, b) => (a.fills[0].executed_at < b.fills[0].executed_at ? 1 : -1));
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
  group, ownPortfolioPct, stwWeight, showPnl, tickerRegime, perStockLadder, perStockLadderConfig, onClose, onViewStwPosition,
}: {
  group: DetailGroup;
  /** This position's share of the subscriber's own book, by market value. */
  ownPortfolioPct: number | null;
  /** STW's own current_weight for this ticker, if tailed. */
  stwWeight: number | null;
  showPnl: boolean;
  /** The ticker's own trend structure + sector-rotation standing (computed once at the page level). */
  tickerRegime?: TickerRegime;
  /** Per-stock drawdown-ladder status for this name (Item 4), computed once at the page level. */
  perStockLadder?: PerStockLadderInfo;
  /** The user's configured per-stock rungs, to render the full ladder. */
  perStockLadderConfig: { drawdownPct: number; holdFractionPct: number }[];
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
  const execGroups = buildExecGroups(execs);

  // Current price of the underlying — live Finnhub quote (the one decided source for
  // equity quotes), falling back to the stored IBKR stock-leg mark when the market's
  // closed / not cached. Same source Stock Picks' detail leads with. Each carries its
  // own source + as-of stamp (fmtDateTime, the predefined format) — never a bare number.
  const quote = useQuote(group.underlying);
  const stockMark = group.positions.find((p) => p.asset_class === 'STK')?.mark_price ?? null;
  const livePrice = quote?.c ?? null;
  const isLivePrice = livePrice !== null;
  const price = isLivePrice ? livePrice : stockMark;
  const dayPct = quote?.dp ?? null;
  const quoteTime = quote?.t ? fmtDateTime(new Date(quote.t * 1000)) : null;      // Finnhub quote time
  const syncTime = group.positions[0]?.last_synced_at ? fmtDateTime(group.positions[0].last_synced_at) : null; // IBKR sync time
  const priceSource = isLivePrice ? (quoteTime ? `Finnhub · ${quoteTime}` : 'Finnhub') : (syncTime ? `IBKR · ${syncTime}` : 'IBKR');

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
      key: 'price',
      content: (
        <>
          <DetailPaneMetricLabel>{isLivePrice ? 'Current Price' : 'Last Price'}</DetailPaneMetricLabel>
          <div style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', lineHeight: 1.1 }}>
            {price !== null ? `$${price.toFixed(2)}` : '—'}
          </div>
          {isLivePrice && dayPct !== null && (
            <div style={{ fontSize: FONT_SIZE.xs, marginTop: SPACE[0.5], fontWeight: FONT_WEIGHT.semibold, color: dayPct >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)' }}>
              {dayPct >= 0 ? '+' : ''}{dayPct.toFixed(2)}% today
            </div>
          )}
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[0.5] }}>{priceSource}</div>
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

      {/* Per-stock stop ladder (Item 4) — this name's own drawdown ladder, kept a SEPARATE
          section from the account-wide Portfolio drawdown + the market-regime read above. */}
      {group.hasStock && (
        <Section title="Per-stock stop ladder">
          <PerStockLadderDetail info={perStockLadder} ladder={perStockLadderConfig} />
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

      {/* Transaction History — the user's OWN fills, GROUPED into the position each
          belongs to (a contract, or all shares) so every group states its outcome:
          a closed group shows realized P&L, an open one shows it's still on. The fills
          nest underneath. From user_executions; the entry-history equivalent of Stock
          Picks' Transaction History. */}
      <Section title="Transaction History">
        {execGroups.length === 0 ? (
          <EmptyState
            icon="🧾"
            message="No synced fills for this position yet. Import your IBKR trade history from Settings to see your transactions here."
          />
        ) : (
          <div>
            {execGroups.map((g) => {
              const retPct = g.closed && g.costBasis > 0 ? (g.realized / g.costBasis) * 100 : null;
              return (
                <div key={g.key} style={{ display: 'flex', justifyContent: 'space-between', gap: SPACE[2], padding: '6px 0', borderTop: '1px solid var(--bsub)', fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>
                  {/* Instrument + its fills (same instrument · muted-subline idiom as the P&L section) */}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ color: 'var(--text)', fontWeight: FONT_WEIGHT.medium }}>{g.label}</span>
                    {g.fills.map((x) => (
                      <span key={x.id} style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ color: x.side === 'SELL' ? 'var(--pnl-loss)' : 'var(--acc)', fontWeight: FONT_WEIGHT.semibold }}>{x.side === 'SELL' ? 'Sell' : 'Buy'}</span>
                        {' '}{x.quantity !== null ? Math.abs(x.quantity) : '—'} @ {x.price !== null ? `$${x.price.toFixed(2)}` : '—'} · {fmtDateTime(x.executed_at)}
                      </span>
                    ))}
                  </span>
                  {/* Outcome (right-aligned value, same as the P&L section): realized when
                      closed, else still-open status. */}
                  <span style={{ alignSelf: 'flex-start', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {g.closed
                      ? (showPnl
                          ? <span style={{ color: pnlColor(g.realized), fontWeight: FONT_WEIGHT.semibold, fontVariantNumeric: 'tabular-nums' }}>{g.realized >= 0 ? '+' : ''}{fmtMoney(g.realized)}{retPct !== null ? ` (${fmtPct(retPct)})` : ''}</span>
                          : <span style={{ color: 'var(--t3)' }}>Closed</span>)
                      : <span style={{ color: 'var(--t3)' }}>Open · {Math.abs(g.netQty)}</span>}
                  </span>
                </div>
              );
            })}
            <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[2] }}>
              Source: IBKR executions{syncTime ? ` · synced ${syncTime}` : ''}
            </div>
          </div>
        )}
      </Section>
    </DetailPane>
  );
}
