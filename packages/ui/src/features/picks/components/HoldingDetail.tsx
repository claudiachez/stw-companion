import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Holding } from '../api';
import {
  TIERS, fmtDateTime, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACE,
  holdingType, holdingPnlPct, closedPnlPct, closedPnlContribution, legIsOpen, legUnrealizedPnlPct, legMarkReason,
  fmtOptionExpiry, fmtLegInstrument, displayInitialWeight,
} from '@stw/shared';
import { useQuote } from '../../../hooks/useLivePrice';
import { usePriceCacheStore } from '../../../store/priceCache';
import { useCapabilities } from '../../../context/AppCapabilities';
import { PositionEditor } from './PositionEditor';
import { LegTimeline } from './LegTimeline';
import { ConvictionTimeline } from './ConvictionTimeline';
import { SourceLink } from './SourceLink';
import { RegimeBadge } from './RegimeBadge';
import { Badge } from '../../../primitives/Badge';
import { DetailPane, DetailPaneMetricLabel, DetailPaneSection } from '../../../primitives/DetailPane';
import { useUserPositions } from '../../portfolio/useUserPositions';
import { cleanUnderlying } from '../../portfolio/api';
import { useEarningsCalendar } from '../../earnings/useEarningsCalendar';
import { EarningsBadge } from '../../earnings/EarningsBadge';
import type { TickerRegime } from '../useTickerRegime';

function PriceEmptyState({ fetchStatus }: { fetchStatus: string }) {
  if (fetchStatus === 'fetching') return <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', fontStyle: 'italic' }}>Loading…</div>;
  return <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>Unavailable</div>;
}

function fmtDate(s: string | null): string {
  if (!s) return '–';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// The stat block's "big" value. Design calls for 19px; there is no 19 token, so this uses
// FONT_SIZE.xl (20) — the token documented for "at-a-glance stat numbers", 1px over spec.
const statBig = (color: string): React.CSSProperties => ({ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' });

interface Props {
  holding: Holding;
  totalCount: number;
  onClose: () => void;
  isMobile?: boolean;
  /** Newest IBKR options-sync time across the portfolio; lets us flag a stale price. */
  latestOptionsSync?: Date | null;
  /** This ticker's own trend structure + sector standing (undefined while still loading). */
  regime?: TickerRegime;
}

export function HoldingDetail({ holding: h, totalCount, onClose, isMobile = false, latestOptionsSync = null, regime }: Props) {
  const { canEdit, canViewHistory, isAdmin } = useCapabilities();
  const showHistory = canViewHistory || isAdmin;

  // §5.5 reverse cross-link: on the subscriber web app, if you actually hold this ticker,
  // offer a jump to your own position — the other half of the pick ↔ execution loop.
  // Gated on !isAdmin so it never shows in the admin app (which has no /portfolio route).
  const navigate = useNavigate();
  const { data: ownPositions = [] } = useUserPositions();
  const holdsOwn = !isAdmin && h.ticker !== 'CASH' && ownPositions.some((p) => cleanUnderlying(p.underlying) === h.ticker);
  const [editing, setEditing] = useState(false);

  const { getNext: getNextEarnings } = useEarningsCalendar();
  const nextEarnings = h.ticker !== 'CASH' ? getNextEarnings(h.ticker) : null;

  const quote       = useQuote(h.ticker);
  const fetchStatus = usePriceCacheStore((s) => s.fetchStatus);
  const tier        = TIERS[h.conviction] ?? TIERS[0];
  const pType       = holdingType(h.legs);

  // ── Price (Finnhub live underlying) ───────────────────────
  const livePrice   = quote?.c ?? null;
  const price       = livePrice;
  const isLive      = livePrice != null;
  const dpStr       = quote?.dp != null ? `${quote.dp >= 0 ? '+' : ''}${quote.dp.toFixed(2)}%` : null;
  const dpColor     = (quote?.dp ?? 0) >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)';
  const hiloStr     = (quote?.h && quote?.l) ? `H $${quote.h.toFixed(2)} · L $${quote.l.toFixed(2)}` : null;
  // All carry the established fmtDateTime stamp ("Mon D · H:MM AM ET").
  const srcTime     = quote?.t ? fmtDateTime(new Date(quote.t * 1000)) : null;   // Finnhub quote time

  // ── Legs (the %-P&L source of truth) ──────────────────────
  const openLegs   = h.legs.filter(legIsOpen);
  const optionLegs = h.legs.filter((l) => l.instrument_type === 'OPTION');
  const shareLegs  = h.legs.filter((l) => l.instrument_type === 'SHARES');
  // ── P&L — split by asset class so a big option return never reads as a position move ─────────
  // OPEN (unrealized), per asset class — only the still-open legs of each kind. The P&L Breakdown
  // (open-only per spec) reads off these too, so closed legs never show as "not priced".
  const openShareLegs  = openLegs.filter((l) => l.instrument_type === 'SHARES');
  const openOptionLegs = openLegs.filter((l) => l.instrument_type === 'OPTION');
  const validLegs  = openOptionLegs.filter((l) => l.mark_price != null); // open + priced by IBKR
  const sumW = (ls: typeof openLegs) => ls.reduce((s, l) => s + (l.weight ?? 0), 0);
  const openSharesPnl  = holdingPnlPct(openShareLegs, livePrice);
  const openOptionsPnl = holdingPnlPct(openOptionLegs, livePrice);
  // CLOSED (realized), per asset: weighted return % + its portfolio contribution (return × sold weight).
  const closedSharesPnl    = closedPnlPct(shareLegs);
  const closedOptionsPnl   = closedPnlPct(optionLegs);
  const closedSharesContrib  = closedPnlContribution(shareLegs);
  const closedOptionsContrib = closedPnlContribution(optionLegs);
  const pnlCol = (v: number | null | undefined) => (v != null && v >= 0 ? 'var(--pnl-gain)' : v != null ? 'var(--pnl-loss)' : undefined);

  // Newest OPTION leg mark across this holding → the "IBKR · <time>" stamp + stale flag.
  const newestMarkAt = optionLegs.reduce<Date | null>((acc, l) => {
    if (!l.mark_price_at) return acc;
    const d = new Date(l.mark_price_at);
    return !acc || d > acc ? d : acc;
  }, null);
  const ibkrDate = newestMarkAt ? fmtDateTime(newestMarkAt) : null;
  const ddDate   = h.dd_updated_at ? fmtDateTime(h.dd_updated_at) : null; // DD/conviction last refreshed
  // Stale: this holding's option marks predate the portfolio's newest sync, so the price shown
  // is old — the date shown is when THIS mark was captured, not "now".
  const ibkrStale =
    (pType === 'options' || pType === 'mixed') &&
    newestMarkAt != null && latestOptionsSync != null &&
    newestMarkAt.getTime() < latestOptionsSync.getTime();

  // ── P&L source line(s) ───────────────────────────────────
  // Name the actual data source, each with its own "as of" stamp. Shares ride the
  // live Finnhub price (or the last-synced price); options come from IBKR. A mixed
  // position shows BOTH lines, since the two halves refresh on different clocks.
  const sharesSrc = isLive
    ? (srcTime ? `Finnhub · ${srcTime}` : 'Finnhub')
    : null;
  // For options, show the price's own capture date. When stale, mark it so an old price
  // isn't mistaken for a fresh sync.
  const ibkrSrc = ibkrDate ? `IBKR · ${ibkrDate}${ibkrStale ? ' · stale' : ''}` : 'IBKR';

  function pnlSrcLines(): { text: string; stale?: boolean }[] {
    if (pType === 'options') return [{ text: ibkrSrc, stale: ibkrStale }];
    if (pType === 'mixed')   return sharesSrc
      ? [{ text: sharesSrc }, { text: ibkrSrc, stale: ibkrStale }]
      : [{ text: ibkrSrc, stale: ibkrStale }];
    return sharesSrc ? [{ text: sharesSrc }] : []; // shares
  }

  // ── Conviction segments ───────────────────────────────────
  const convSegs = [1, 2, 3, 4, 5].map((v) => (
    <div key={v} style={{ flex: 1, height: 6, borderRadius: RADIUS.sm, background: v <= h.conviction ? tier.color : 'var(--border)' }} />
  ));

  // ── Render helpers ────────────────────────────────────────
  // Still needed for the P&L Breakdown card's own internal 3-column layout (Shares / Options /
  // Options Detail) — a separate, smaller column split from the top-level DetailPane metrics.
  const colBorder: React.CSSProperties = { borderLeft: '1px solid var(--border)', paddingLeft: SPACE[3] };

  // Content for DetailPane's first stat column — no outer wrapper div; DetailPane owns the
  // grid/border/spacing for all columns now.
  function renderPriceContent() {
    return (
      <>
        <DetailPaneMetricLabel>{isLive ? 'Live market' : 'Last price'}</DetailPaneMetricLabel>
        {price ? (
          <>
            <div style={statBig('var(--text)')}>${price.toFixed(2)}</div>
            {isLive && dpStr  && <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: 400, color: dpColor, marginTop: 2 }}>{dpStr}</div>}
            {isLive && hiloStr && <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 1 }}>{hiloStr}</div>}
            <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 4, opacity: 0.8 }}>
              {srcTime ? `Finnhub · ${srcTime}` : 'Finnhub'}
            </div>
          </>
        ) : (
          <PriceEmptyState fetchStatus={fetchStatus} />
        )}
      </>
    );
  }

  // One "Shares/Options +X%" line. `lot` (open) shows the open weight; `contrib` (closed) shows the
  // portfolio contribution. Exactly one of lot/contrib is passed.
  function assetPnlRow(name: string, pct: number, lot: number | null, contrib: number | null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: FONT_SIZE.sm, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: 'var(--t2)' }}>{name}</span>
        <span>
          <span style={{ color: pnlCol(pct), fontWeight: FONT_WEIGHT.bold }}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
          {lot != null && <span style={{ color: 'var(--t3)' }}> ({lot.toFixed(1)}% lot)</span>}
          {contrib != null && <span style={{ color: 'var(--t3)' }}> ({contrib >= 0 ? '+' : ''}{contrib.toFixed(2)}%)</span>}
        </span>
      </div>
    );
  }

  function renderPnlContent() {
    const srcLines = pnlSrcLines();
    const hasOpenPnl   = openSharesPnl != null || openOptionsPnl != null;
    const hasClosedPnl = closedSharesPnl != null || closedOptionsPnl != null;
    return (
      <>
        {openLegs.length > 0 && (
          <>
            <DetailPaneMetricLabel>Open P&L</DetailPaneMetricLabel>
            {hasOpenPnl ? (
              <>
                {openSharesPnl  != null && assetPnlRow('Shares',  openSharesPnl,  sumW(openShareLegs),  null)}
                {openOptionsPnl != null && assetPnlRow('Options', openOptionsPnl, sumW(openOptionLegs), null)}
                {srcLines.map((line, i) => (
                  <div key={i} style={{ fontSize: FONT_SIZE['2xs'], color: line.stale ? 'var(--c3)' : 'var(--t3)', marginTop: i === 0 ? 4 : 1, opacity: line.stale ? 1 : 0.8 }}>{line.text}</div>
                ))}
              </>
            ) : (
              (pType === 'options' || pType === 'mixed')
                ? <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>No IBKR data</div>
                : <PriceEmptyState fetchStatus={fetchStatus} />
            )}
          </>
        )}
        {hasClosedPnl && (
          <div style={{ marginTop: openLegs.length > 0 ? 8 : 0 }}>
            <DetailPaneMetricLabel>Closed <span style={{ textTransform: 'none', letterSpacing: 0 }}>(Portfolio Contribution %)</span></DetailPaneMetricLabel>
            {closedSharesPnl  != null && assetPnlRow('Shares',  closedSharesPnl,  null, closedSharesContrib)}
            {closedOptionsPnl != null && assetPnlRow('Options', closedOptionsPnl, null, closedOptionsContrib)}
          </div>
        )}
        {openLegs.length === 0 && !hasClosedPnl && <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>Position closed</div>}
      </>
    );
  }

  function renderWeightContent() {
    // Initial = Σ the open legs' lots (the size actually deployed, from the diary); for a fully-closed
    // position it falls back to the closed legs' entry lots so it still shows the original size.
    // Current = holdings.current_weight — the live portfolio weight the routines restate.
    const initWeight = displayInitialWeight(h.legs);
    const curWeight  = h.current_weight;
    return (
      <>
        <DetailPaneMetricLabel>STW's weight</DetailPaneMetricLabel>
        <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
          {initWeight != null ? `${initWeight}%` : '—'}
          <span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.medium, margin: '0 4px' }}>→</span>
          {curWeight != null ? `${curWeight}%` : '—'}
        </div>
        {openLegs.length > 0 ? (
          /* one OPEN leg per line — closed legs live in Transaction History */
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t2)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {openLegs.map((l) => (
              <div key={l.id} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {l.weight != null && <span style={{ color: 'var(--text)', fontWeight: FONT_WEIGHT.semibold }}>{l.weight}% </span>}
                {l.instrument_type === 'SHARES' ? 'Shares' : fmtLegInstrument(l)}
                {l.instrument_type === 'SHARES' && l.entry_price != null ? ` @ $${l.entry_price}` : ''}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 4 }}>initial → current</div>
        )}
      </>
    );
  }

  // "Your side" — whether the subscriber tails this pick, the other half of the pick↔execution
  // loop. Absent in the admin app (no /portfolio route; holdsOwn is always false there).
  function renderYourSideContent() {
    return (
      <>
        <DetailPaneMetricLabel>Your side</DetailPaneMetricLabel>
        <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: holdsOwn ? 'var(--acc)' : 'var(--t3)', lineHeight: 1.15 }}>
          {holdsOwn ? 'Tailing' : 'Not held'}
        </div>
        <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 4 }}>
          {holdsOwn ? 'you hold this' : "you don't tail this pick"}
        </div>
      </>
    );
  }

  function renderPnlBreakdown() {
    if (pType !== 'mixed') return null;
    if (openSharesPnl == null && openOptionsPnl == null) return null;
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: RADIUS.md, padding: '10px 12px', marginBottom: SPACE[2.5] }}>
        <DetailPaneMetricLabel>P&L Breakdown</DetailPaneMetricLabel>
        {/* Shares 25% · Options 25% · Options Detail 50% (stacks on mobile). */}
        <div style={{ display: 'flex', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? 10 : 0, alignItems: 'flex-start' }}>
          {openSharesPnl != null && (
            <div style={{ flex: isMobile ? '1 1 40%' : '0 0 25%' }}>
              <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginBottom: 3 }}>Shares</div>
              <div style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: openSharesPnl >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)', fontVariantNumeric: 'tabular-nums' }}>
                {openSharesPnl >= 0 ? '+' : ''}{openSharesPnl.toFixed(1)}%
              </div>
              {openShareLegs[0]?.entry_price != null && (
                <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 2 }}>from ${openShareLegs[0].entry_price!.toFixed(2)}</div>
              )}
            </div>
          )}
          {openOptionsPnl != null && (
            <div style={{ flex: isMobile ? '1 1 40%' : '0 0 25%', ...(openSharesPnl != null && !isMobile ? colBorder : {}) }}>
              <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginBottom: 3 }}>Options</div>
              <div style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: openOptionsPnl >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)', fontVariantNumeric: 'tabular-nums' }}>
                {openOptionsPnl >= 0 ? '+' : ''}{openOptionsPnl.toFixed(1)}%
              </div>
              {validLegs.length > 0 && (
                <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 2 }}>
                  {validLegs.length} leg{validLegs.length > 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
          {openOptionLegs.length > 0 && (
            <div style={{ flex: isMobile ? '1 1 100%' : '1 1 50%', ...(isMobile ? { borderTop: '1px solid var(--border)', paddingTop: 10 } : colBorder) }}>
              <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginBottom: 3 }}>Options Detail</div>
              {renderLegRowsCompact()}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Compact option-leg list for the P&L Breakdown's third column (mixed positions): two tight
  // lines per leg — strike/expiry + P&L%, then entry→mark + per-contract (or unpriced reason).
  function renderLegRowsCompact() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {openOptionLegs.map((leg) => {
          const right       = leg.option_right === 'PUT' ? 'P' : 'C';
          const pnl         = legUnrealizedPnlPct(leg, livePrice);
          const mark        = leg.mark_price;
          const entry       = leg.entry_price;
          const lColor      = pnl != null ? (pnl >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)') : 'var(--t3)';
          const perContract = mark != null && entry != null ? (mark - entry) * 100 : null;
          const reason      = legMarkReason(leg);
          return (
            <div key={leg.id} style={{ fontSize: FONT_SIZE.xs }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>${leg.option_strike}{right}</span>
                  <span style={{ color: 'var(--t3)', marginLeft: 6 }}>{fmtOptionExpiry(leg.option_expiry)}</span>
                </span>
                {pnl != null && (
                  <span style={{ fontWeight: FONT_WEIGHT.bold, color: lColor, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                  </span>
                )}
              </div>
              {mark != null && entry != null ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                  <span>${entry.toFixed(2)} → ${mark.toFixed(2)}</span>
                  {perContract != null && (
                    <span style={{ flexShrink: 0 }}>{perContract >= 0 ? '+' : ''}${Math.abs(perContract).toFixed(0)}/ct</span>
                  )}
                </div>
              ) : (
                reason && (
                  <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--c3)', marginTop: 1, lineHeight: 1.3 }}>
                    {reason.title}{reason.hint ? ` · ${reason.hint}` : ''}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Option-leg rows (entry → mark, P&L, unpriced reason). Rendered inside the P&L Breakdown
  // card for mixed positions; as their own section for options-only positions.
  function renderLegRows() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {openOptionLegs.map((leg) => {
            const right       = leg.option_right === 'PUT' ? 'P' : 'C';
            const pnl         = legUnrealizedPnlPct(leg, livePrice);
            const mark        = leg.mark_price;
            const entry       = leg.entry_price;
            const lColor      = pnl != null ? (pnl >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)') : 'var(--t3)';
            const perContract = mark != null && entry != null ? (mark - entry) * 100 : null;
            const reason      = legMarkReason(leg); // why this leg has no mark (if so)
            return (
              <div key={leg.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderRadius: RADIUS.DEFAULT,
                background: 'var(--s2)', border: '1px solid var(--bsub)',
                fontSize: FONT_SIZE.xs, gap: 8,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      ${leg.option_strike}{right}
                    </span>
                    <span style={{ color: 'var(--t3)' }}>{fmtOptionExpiry(leg.option_expiry)}</span>
                  </div>
                  {reason && (
                    <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--c3)', lineHeight: 1.3 }}>
                      {reason.title}{reason.hint ? ` · ${reason.hint}` : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
                    {entry != null ? `$${entry.toFixed(2)}` : '—'} → {mark != null ? `$${mark.toFixed(2)}` : '—'}
                  </span>
                  {pnl != null && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: FONT_WEIGHT.bold, color: lColor, fontVariantNumeric: 'tabular-nums' }}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                      </div>
                      {perContract != null && (
                        <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
                          {perContract >= 0 ? '+' : ''}${Math.abs(perContract).toFixed(2)}/contract
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
    );
  }

  // Options-only positions: legs as their own section (mixed renders them in breakdown).
  function renderLegsSection() {
    if (pType !== 'options' || openOptionLegs.length === 0) return null;
    return (
      <DetailPaneSection title="Options legs">
        {renderLegRows()}
      </DetailPaneSection>
    );
  }

  return (
    <>
      {/* Edit — a single modal: position fields + legs together (admin only) */}
      {editing && <PositionEditor holding={h} onDone={() => setEditing(false)} />}

      <DetailPane
        eyebrow="Stock Picks · STW's pick"
        title={<span style={{ color: tier.color }}>{h.ticker}</span>}
        subtitle={h.action_date ? `${h.name} · last action ${fmtDate(h.action_date)}` : h.name}
        isMobile={isMobile}
        onClose={onClose}
        badges={
          <>
            <Badge kind="category" category={h.basket} />
            <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: RADIUS.DEFAULT, color: 'var(--t2)', background: 'var(--s2)', border: '1px solid var(--border)' }}>
              Rank #{String(h.rank).padStart(2, '0')} / {totalCount}
            </span>
            <Badge kind="tier" tier={h.conviction} />
            <Badge kind="action" action={h.last_action} />
            {h.ticker !== 'CASH' && <RegimeBadge regime={regime} />}
            {nextEarnings && <EarningsBadge event={nextEarnings} />}
            {canEdit && h.ticker !== 'CASH' && !editing && (
              <button
                onClick={() => setEditing(true)}
                style={{
                  fontSize: FONT_SIZE['2xs'], color: 'var(--acc)', background: 'none',
                  border: '1px solid var(--border)', borderRadius: RADIUS.DEFAULT, cursor: 'pointer',
                  padding: '2px 8px',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                ✎ Edit
              </button>
            )}
          </>
        }
        metrics={h.ticker !== 'CASH' ? [
          { key: 'price', content: renderPriceContent() },
          { key: 'pnl', content: renderPnlContent() },
          { key: 'weight', content: renderWeightContent() },
          { key: 'yourside', content: renderYourSideContent() },
        ] : undefined}
      >
        {holdsOwn && (
          <button
            onClick={() => navigate(`/portfolio?ticker=${encodeURIComponent(h.ticker)}`)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)', background: 'none', border: '1px solid var(--c5b)', borderRadius: RADIUS.md, padding: '6px 12px', cursor: 'pointer', marginBottom: SPACE[2.5] }}
          >
            View your position →
          </button>
        )}

        {/* CASH: show portfolio weight (can be negative = margin / leverage) */}
        {h.ticker === 'CASH' && (() => {
          const cw = h.current_weight ?? h.initial_weight ?? 0;
          return (
            <div style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: RADIUS.md, padding: '10px 12px', marginBottom: SPACE[2.5] }}>
              <DetailPaneMetricLabel>Portfolio Weight</DetailPaneMetricLabel>
              {/* A negative CASH weight is leverage, not P&L — var(--status-negative-text), not
                  var(--pnl-loss). Same distinction drawn in HoldingRow.tsx's weight readout. */}
              <div style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: cw < 0 ? 'var(--status-negative-text)' : 'var(--text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                {cw.toFixed(1)}%
              </div>
              <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 4 }}>
                {cw < 0 ? 'Negative — margin / leverage in use' : 'Cash position'}
              </div>
            </div>
          );
        })()}

        {/* Mixed: P&L breakdown (shares / options) */}
        {renderPnlBreakdown()}

        {/* Options legs */}
        {renderLegsSection()}

        {/* STW's conviction meter */}
        {h.ticker !== 'CASH' && (
          <DetailPaneSection title="STW's conviction" action={ddDate ? <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>updated {ddDate}</span> : undefined}>
            <div style={{ display: 'flex', gap: 3 }}>{convSegs}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 3 }}>
              <span>Concern</span><span style={{ color: 'var(--status-positive-text)', fontWeight: FONT_WEIGHT.bold }}>Highest {h.conviction}/5</span>
            </div>
          </DetailPaneSection>
        )}

        {/* Why STW holds it — the durable "why he's in it" (green positive card). The ↗ opens
            the original DD message (everyone sees it; Discord gates access). */}
        {h.summary && (
          <div style={{ position: 'relative', padding: '12px 14px', paddingRight: h.dd_source_url ? 30 : 14, borderRadius: 10, background: 'var(--c5bg)', border: '1px solid var(--c5b)', marginBottom: SPACE[2.5] }}>
            <div style={{ fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, color: 'var(--acc)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: SPACE[1.5] }}>Why STW holds it</div>
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.6 }}>{h.summary}</div>
            <SourceLink url={h.dd_source_url} title="Open DD source message" style={{ position: 'absolute', top: 6, right: 6 }} />
          </div>
        )}

        {/* Key points (part of the durable thesis, not the latest comment) */}
        {h.bullets && h.bullets.length > 0 && (
          <DetailPaneSection title={`Key points${ddDate ? ` · ${ddDate}` : ''}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {h.bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5 }}>
                  <span style={{ color: tier.color, flexShrink: 0, marginTop: 2 }}>◆</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </DetailPaneSection>
        )}

        {/* Commentary — STW's public conviction_comments (user_id null: Discord/stream notes),
            newest first. The subscriber's own private note is its own section below. */}
        {showHistory && h.ticker !== 'CASH' && (
          <DetailPaneSection title="Commentary">
            <ConvictionTimeline ticker={h.ticker} currentConviction={h.conviction} scope="stw" />
          </DetailPaneSection>
        )}

        {/* Your personal note — the subscriber's own private note (RLS: only they can read it),
            a distinct section per the design. Subscriber-only; admins author STW commentary. */}
        {showHistory && !isAdmin && h.ticker !== 'CASH' && (
          <DetailPaneSection title="Your personal note" action={<span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>only you see this</span>}>
            <ConvictionTimeline ticker={h.ticker} currentConviction={h.conviction} scope="personal" />
          </DetailPaneSection>
        )}

        {/* Transaction history — the position's evolution, from leg_transactions (same source as
            the legs, so they can't disagree). LegTimeline carries the All/Open/Closed filters and,
            for admins (canEdit), the + Add / ✎ edit / ✕ delete ledger controls. */}
        {showHistory && h.ticker !== 'CASH' && (
          <DetailPaneSection title="Transaction history">
            <LegTimeline ticker={h.ticker} legs={h.legs} />
            <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[2] }}>
              Source: STW's posted trades{h.action_date ? ` · last action ${fmtDate(h.action_date)}` : ''}
            </div>
          </DetailPaneSection>
        )}
      </DetailPane>
    </>
  );
}
