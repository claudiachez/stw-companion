import { useState } from 'react';
import { regimeGate, regimeExitAdvice, classifySeverity, formatDate, formatMoney, fmtDateTime, fmtOptionExpiry, sizingTone, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACE, type ViolationSeverity } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useQuote } from '../../hooks/useLivePrice';
import { DetailPane, DetailPaneMetricLabel, DetailPaneSection } from '../../primitives/DetailPane';
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
const SEVERITY_COLOR: Record<ViolationSeverity, string> = {
  ok: 'var(--acc)', near: 'var(--status-warning-text)', breach: 'var(--status-negative-text)', unevaluated: 'var(--t3)',
};

// The stat block's "big" value. Design calls for 19px; there is no 19 token, so this uses
// FONT_SIZE.xl (20) — the token documented for "at-a-glance stat numbers", 1px over spec.
const statBig = (color: string): React.CSSProperties => ({ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color, lineHeight: 1.15 });

// Compact "Against your risk plan" rows (ref: Size / Stop ladder / Market lights as a tight
// dot-row list, no dividers/sub-headers).
const riskRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap' };
const riskText: React.CSSProperties = { fontSize: FONT_SIZE.sm, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums', flex: 1, minWidth: 0 };
const riskDot = (c: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: RADIUS.full, background: c, flexShrink: 0 });
const fmtDd2 = (pct: number) => `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;
function stopLadderSummary(info: PerStockLadderInfo): string {
  const s = info.status;
  if (s.activeRung && s.alreadyComplies !== true) {
    return `${fmtDd2(s.drawdownPct)} vs entry — past the ${s.activeRung.drawdownPct}% rung, keep ≤${s.targetHoldPct}% of peak`;
  }
  if (s.nextRung) {
    return `${fmtDd2(s.drawdownPct)} vs entry — first stop ${s.distanceToNextPp != null ? `${s.distanceToNextPp.toFixed(1)}pp away ` : ''}(${s.nextRung.drawdownPct}% → keep ≤${s.nextRung.holdFractionPct}%)`;
  }
  return `${fmtDd2(s.drawdownPct)} vs entry`;
}

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

type TxFilter = 'all' | 'open' | 'closed';

/** All/Open/Closed segmented control — the same idiom LegTimeline's history filter uses. */
function FilterChips({ value, onChange }: { value: TxFilter; onChange: (f: TxFilter) => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: RADIUS.md, overflow: 'hidden' }}>
      {(['all', 'open', 'closed'] as const).map((f) => (
        <button key={f} onClick={() => onChange(f)}
          style={{
            fontSize: FONT_SIZE['2xs'], padding: '3px 9px', border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            background: value === f ? 'var(--acc)' : 'transparent', color: value === f ? 'var(--text-inverse)' : 'var(--t2)',
          }}>
          {f}
        </button>
      ))}
    </div>
  );
}

/**
 * My Portfolio's own-position detail pane — an instance of the shared DetailPane (same
 * skeleton as the Stock Picks pane): eyebrow strip + 22px header + 4-col stat block, then
 * stacked section cards (Tailing / Against your risk plan / Open P&L by holding /
 * Transaction history). Reuses the position's existing risk / tailing / ladder / execution
 * data — this is a re-layout, not new logic. Ticker-click default is this pane, not STW's
 * tracked position (host, 2026-07-06) — STW's view is an explicit link in the Tailing card.
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
  const [txFilter, setTxFilter] = useState<TxFilter>('all');

  const gate = regime ? regimeGate(
    { close: regime.close, sma200: regime.sma200 },
    { vixClose: regime.vix_close, vix3mClose: regime.vix3m_close },
  ) : null;
  const regimeAdvice = gate && config ? regimeExitAdvice(gate, {
    trimToPct: config.regime_trim_to_pct, stopPct: config.regime_stop_pct, doubleRedGrossPct: config.regime_doublered_gross_pct,
  }) : null;

  const legCount = group.positions.length;
  const composition = group.hasStock && group.hasOption ? 'Shares + options' : group.hasOption ? 'Options only' : 'Shares only';
  // Lowercase, count-aware composition for the stat sub-line, matching the mock's "shares + an option".
  const optionLegCount = group.positions.filter((p) => p.asset_class !== 'STK').length;
  const holdingsComposition = [
    group.hasStock ? 'shares' : null,
    optionLegCount === 1 ? 'an option' : optionLegCount > 1 ? `${optionLegCount} options` : null,
  ].filter(Boolean).join(' + ');

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
  const filteredGroups = execGroups.filter((g) => txFilter === 'all' || (txFilter === 'open' ? !g.closed : g.closed));

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
  const tone = sizingTone(sizeDelta);
  // Dollar weight the size gap represents, ≈ (delta pp) × account value. Account value is
  // backed out of this position's market value and its book share — no new data path.
  const dollarDelta = sizeDelta !== null && ownPortfolioPct !== null && ownPortfolioPct !== 0
    ? group.marketValue * (sizeDelta / ownPortfolioPct)
    : null;

  // Header badges = the ticker's market SECTOR (universal to the position) + its own
  // technical read: trend structure + sector-rotation standing (RegimeBadge), the same
  // two chips the Stock Picks detail shows. The tailed-pick info (trader / basket /
  // conviction / sizing) stays in the Tailing section, not the header (host, 2026-07-08).
  const badges = (sector || tickerRegime || nextEarnings) ? (
    <>
      {sector && (
        <span style={{
          fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label,
          textTransform: 'uppercase', color: 'var(--t2)', background: 'var(--s2)',
          border: '1px solid var(--border)', borderRadius: RADIUS.DEFAULT, padding: '2px 8px', whiteSpace: 'nowrap',
        }}>{sector}</span>
      )}
      <RegimeBadge regime={tickerRegime} />
      {nextEarnings && <EarningsBadge event={nextEarnings} />}
    </>
  ) : null;

  const metrics = [
    {
      key: 'position',
      content: (
        <>
          <DetailPaneMetricLabel>Your position</DetailPaneMetricLabel>
          <div style={statBig('var(--text)')}>{fmtMoney(group.marketValue)}</div>
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[0.5] }}>
            {ownPortfolioPct !== null ? `${ownPortfolioPct.toFixed(1)}% of your account` : 'market value'}
          </div>
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[0.5] }}>{legCount} holding{legCount !== 1 ? 's' : ''} · {holdingsComposition}</div>
        </>
      ),
    },
    {
      key: 'price',
      content: (
        <>
          <DetailPaneMetricLabel>{isLivePrice ? 'Current price' : 'Last price'}</DetailPaneMetricLabel>
          <div style={statBig('var(--text)')}>{price !== null ? `$${price.toFixed(2)}` : '—'}</div>
          {isLivePrice && dayPct !== null && (
            <div style={{ fontSize: FONT_SIZE['2xs'], marginTop: SPACE[0.5], fontWeight: FONT_WEIGHT.semibold, color: dayPct >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)' }}>
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
              <div style={statBig(pnlColor(group.netPnl))}>{formatMoney(group.netPnl, { signed: true })}</div>
              <div style={{ fontSize: FONT_SIZE['2xs'], color: pnlColor(group.netPnl), marginTop: SPACE[0.5], lineHeight: 1.4 }}>
                {group.returnPct !== null ? `${fmtPct(group.returnPct)} vs what you paid` : 'vs what you paid'}
              </div>
              <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.4 }}>on open holdings only</div>
            </>
          ) : (
            <div style={{ fontSize: FONT_SIZE.base, color: 'var(--t3)' }}>Hidden</div>
          )}
        </>
      ),
    },
    {
      key: 'cap',
      content: (
        <>
          <DetailPaneMetricLabel>Vs your cap</DetailPaneMetricLabel>
          {config ? (
            <>
              <div style={statBig(posSeverity ? SEVERITY_COLOR[posSeverity] : 'var(--text)')}>{posPct.toFixed(1)}%</div>
              <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[0.5] }}>of your {config.max_position_pct}% one-stock cap</div>
              <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.4 }}>
                {config.max_position_pct - posPct >= 0
                  ? `${(config.max_position_pct - posPct).toFixed(1)} points of room left`
                  : `${(posPct - config.max_position_pct).toFixed(1)} points over`}
              </div>
              {posSeverity && <div style={{ marginTop: SPACE[0.5] }}><StatusPill variant={posSeverity}>{SEVERITY_LABEL[posSeverity]}</StatusPill></div>}
            </>
          ) : (
            <div style={{ fontSize: FONT_SIZE.base, color: 'var(--t3)' }}>—</div>
          )}
        </>
      ),
    },
  ];

  return (
    <DetailPane
      eyebrow="My Portfolio · your position"
      title={group.underlying}
      subtitle={group.companyName ?? composition}
      badges={badges}
      metrics={metrics}
      isMobile={isMobile}
      onClose={onClose}
    >
      {/* Tailing — the tailed-pick info on one line (trader · basket · conviction · your-vs-STW
          sizing with the ≈$ gap) + a compact link to STW's tracked position. */}
      <DetailPaneSection title="Tailing">
        {group.isTailed ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap' }}>
              {group.traders.map((t) => <Badge key={t} kind="source" trader={t} />)}
              {group.basket && <Badge kind="category" category={group.basket} />}
              {group.conviction !== null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE[1] }}>
                  <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)' }}>Conviction {group.conviction}/5</span>
                  <Badge kind="tier" tier={group.conviction} />
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
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
              You hold {ownPortfolioPct !== null ? `${ownPortfolioPct.toFixed(1)}%` : '—'} of your account — STW holds {stwWeight !== null ? `${stwWeight.toFixed(1)}%` : '—'} of theirs.
              {tone.state !== 'inline' && (
                <span style={{ color: tone.textVar, fontWeight: FONT_WEIGHT.semibold }}>
                  {' '}{tone.label}{dollarDelta !== null ? ` ≈ ${fmtMoney(Math.abs(dollarDelta))} ${tone.state === 'oversized' ? 'more' : 'less'}` : ''}.
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: FONT_SIZE.sms, color: 'var(--t3)' }}>Not currently tailing any tracked pick for {group.underlying}.</div>
        )}
      </DetailPaneSection>

      {/* Against your risk plan — Size / Stop ladder / Market lights as a compact 3-row dot
          list (ref anatomy), rung chips below, advisory + entry/now footnote. */}
      {config && (
        <DetailPaneSection title="Against your risk plan">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={riskRow}>
              <span style={riskDot(posSeverity ? SEVERITY_COLOR[posSeverity] : 'var(--t3)')} />
              <span style={riskText}>
                Size: {posPct.toFixed(1)}% of your {config.max_position_pct}% one-stock cap
                {config.max_position_pct - posPct >= 0
                  ? ` — ${(config.max_position_pct - posPct).toFixed(1)} points of room left`
                  : ` — ${(posPct - config.max_position_pct).toFixed(1)} points over`}
              </span>
              {posSeverity && <StatusPill variant={posSeverity}>{SEVERITY_LABEL[posSeverity]}</StatusPill>}
            </div>

            {group.hasStock && perStockLadder && (
              <div style={riskRow}>
                <span style={riskDot(SEVERITY_COLOR[perStockLadder.status.severity] ?? 'var(--t3)')} />
                <span style={riskText}>Stop ladder: {stopLadderSummary(perStockLadder)}</span>
                <StatusPill variant={perStockLadder.status.severity === 'ok' ? 'ok' : perStockLadder.status.severity}>{SEVERITY_LABEL[perStockLadder.status.severity]}</StatusPill>
              </div>
            )}

            {!regimeLoading && (gate ? (
              <div style={riskRow}>
                <span style={riskDot('var(--t3)')} />
                <span style={riskText}>
                  Market lights: Trend <b style={{ color: STATE_COLOR[gate.trend_state], fontWeight: FONT_WEIGHT.semibold }}>{gate.trend_state}</b> · Volatility <b style={{ color: STATE_COLOR[gate.vol_state], fontWeight: FONT_WEIGHT.semibold }}>{gate.vol_state}</b>
                  {regime && <span style={{ color: 'var(--t3)' }}> · as of {formatDate(regime.trading_date)}</span>}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: FONT_SIZE.sms, color: 'var(--t3)' }}>No market regime data yet.</div>
            ))}
          </div>

          {group.hasStock && perStockLadderConfig.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE[1.5], marginTop: SPACE[2] }}>
              {perStockLadderConfig.map((r) => {
                const active = perStockLadder?.status.activeRung?.drawdownPct === r.drawdownPct;
                const c = perStockLadder ? (SEVERITY_COLOR[perStockLadder.status.severity] ?? 'var(--t3)') : 'var(--t3)';
                return (
                  <span key={r.drawdownPct} style={{
                    fontSize: FONT_SIZE['2xs'], fontVariantNumeric: 'tabular-nums', padding: '2px 7px', borderRadius: 5,
                    border: `1px solid ${active ? c : 'var(--border)'}`, color: active ? c : 'var(--t3)',
                    background: active ? 'var(--s2)' : 'transparent', fontWeight: active ? FONT_WEIGHT.semibold : undefined,
                  }}>
                    {r.drawdownPct}% → {r.holdFractionPct === 0 ? 'exit' : `keep ≤${r.holdFractionPct}%`}
                  </span>
                );
              })}
            </div>
          )}
          {regimeAdvice && (
            <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', marginTop: SPACE[2], borderLeft: '2px solid var(--status-warning-text)', paddingLeft: SPACE[2] }}>
              Your rule: {regimeAdvice}
            </div>
          )}
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 7, fontStyle: 'italic' }}>
            Advisory — flags only, nothing is traded for you.
            {perStockLadder ? ` Entry avg $${perStockLadder.avgCost.toFixed(2)} · now $${perStockLadder.currentPrice.toFixed(2)}.` : ''}
          </div>
        </DetailPaneSection>
      )}

      {/* Open P&L by holding — Shares / Options breakdown for the OPEN legs, each with its
          cost basis (avg entry → current mark) alongside the unrealized return. */}
      <DetailPaneSection title="Open P&L by holding">
        {showPnl ? group.positions.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: SPACE[2.5], fontSize: FONT_SIZE.sms, padding: '4px 0', color: 'var(--t2)' }}>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: 'var(--text)', fontWeight: FONT_WEIGHT.semibold }}>{instrumentLabel(p)}</span>
              <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
                {p.quantity !== null ? `${Math.abs(p.quantity)} @ ` : ''}avg {p.avg_cost !== null ? `$${p.avg_cost.toFixed(2)}` : '—'}
                {p.mark_price !== null ? ` · mark $${p.mark_price.toFixed(2)}` : ''}
              </span>
            </span>
            <span style={{ color: pnlColor(p.unrealized_pnl), fontWeight: FONT_WEIGHT.bold, fontVariantNumeric: 'tabular-nums', alignSelf: 'flex-start' }}>
              {p.unrealized_pnl !== null ? formatMoney(p.unrealized_pnl, { signed: true }) : '—'} {p.unrealized_pnl_pct !== null && `(${fmtPct(p.unrealized_pnl_pct)})`}
            </span>
          </div>
        )) : <div style={{ fontSize: FONT_SIZE.sms, color: 'var(--t3)' }}>Hidden</div>}
      </DetailPaneSection>

      {/* Transaction history — the user's OWN fills, GROUPED into the position each belongs to
          (a contract, or all shares) so every group states its outcome. From user_executions;
          the entry-history equivalent of Stock Picks' Transaction History. */}
      <DetailPaneSection title="Transaction history" action={execGroups.length > 0 ? <FilterChips value={txFilter} onChange={setTxFilter} /> : undefined}>
        {execGroups.length === 0 ? (
          <EmptyState
            icon="🧾"
            message="No synced fills for this position yet. Import your IBKR trade history from Settings to see your transactions here."
          />
        ) : (
          <div>
            {filteredGroups.map((g) => {
              const retPct = g.closed && g.costBasis > 0 ? (g.realized / g.costBasis) * 100 : null;
              return (
                <div key={g.key} style={{ display: 'flex', justifyContent: 'space-between', gap: SPACE[2], padding: '6px 0', borderTop: '1px solid var(--bsub)', fontSize: FONT_SIZE.sms, color: 'var(--t2)' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ color: 'var(--text)', fontWeight: FONT_WEIGHT.medium }}>{g.label}</span>
                    {g.fills.map((x) => (
                      <span key={x.id} style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ color: x.side === 'SELL' ? 'var(--pnl-loss)' : 'var(--acc)', fontWeight: FONT_WEIGHT.semibold }}>{x.side === 'SELL' ? 'Sell' : 'Buy'}</span>
                        {' '}{x.quantity !== null ? Math.abs(x.quantity) : '—'} @ {x.price !== null ? `$${x.price.toFixed(2)}` : '—'} · {fmtDateTime(x.executed_at)}
                      </span>
                    ))}
                  </span>
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
      </DetailPaneSection>
    </DetailPane>
  );
}
