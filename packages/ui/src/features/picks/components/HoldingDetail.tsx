import { useState } from 'react';
import type { Holding } from '../api';
import {
  TIERS, fmtDateTime, FONT_SIZE, FONT_WEIGHT, SPACE,
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
import { DetailPane, DetailPaneMetricLabel } from '../../../primitives/DetailPane';
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

function HistorySection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginTop: 20 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
        }}
      >
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
          {title} {open ? '▲' : '▼'}
        </span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

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
  const [editing, setEditing] = useState(false);

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
    <div key={v} style={{ flex: 1, height: 6, borderRadius: 3, background: v <= h.conviction ? tier.color : 'var(--border)' }} />
  ));

  // ── Render helpers ────────────────────────────────────────
  // Still needed for the P&L Breakdown card's own internal 3-column layout (Shares / Options /
  // Options Detail) — a separate, smaller column split from the top-level DetailPane metrics.
  const colBorder: React.CSSProperties = { borderLeft: '1px solid var(--border)', paddingLeft: SPACE[3] };

  // Content for DetailPane's first metric column — no outer wrapper div; DetailPane owns the
  // flex/border/spacing for all 3 columns now.
  function renderPriceContent() {
    return (
      <>
        <DetailPaneMetricLabel>{isLive ? 'Live Market' : 'Last Price'}</DetailPaneMetricLabel>
        {price ? (
          <>
            <div style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              ${price.toFixed(2)}
            </div>
            {isLive && dpStr  && <div style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: dpColor, marginTop: 2 }}>{dpStr}</div>}
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
        <DetailPaneMetricLabel>Initial · Current Weight</DetailPaneMetricLabel>
        <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          {initWeight != null ? `${initWeight}%` : '—'}
          <span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.medium, margin: '0 4px' }}>→</span>
          {curWeight != null ? `${curWeight}%` : '—'}
        </div>
        {openLegs.length > 0 ? (
          /* one OPEN leg per line — closed legs live in Transaction History */
          <div style={{ fontSize: isMobile ? FONT_SIZE.xs : FONT_SIZE['2xs'], color: 'var(--t2)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {openLegs.map((l) => (
              <div key={l.id} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {l.weight != null && <span style={{ color: 'var(--text)', fontWeight: FONT_WEIGHT.semibold }}>{l.weight}% </span>}
                {l.instrument_type === 'SHARES' ? 'Shares' : fmtLegInstrument(l)}
                {l.instrument_type === 'SHARES' && l.entry_price != null ? ` @ $${l.entry_price}` : ''}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 4 }}>no open legs</div>
        )}
      </>
    );
  }

  function renderPnlBreakdown() {
    if (pType !== 'mixed') return null;
    if (openSharesPnl == null && openOptionsPnl == null) return null;
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
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
                padding: '6px 10px', borderRadius: 5,
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
      <div style={{ marginBottom: 12 }}>
        <DetailPaneMetricLabel>Options Legs</DetailPaneMetricLabel>
        {renderLegRows()}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Back / Close + Edit buttons — a small custom utility bar, not DetailPane's own close
          button: on mobile this reads "← Back" and moves first via `order`, unlike DetailPane's
          fixed top-right icon-only close affordance, so it stays its own row above DetailPane. */}
      <div style={{ padding: '10px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={onClose}
          style={{
            fontSize: FONT_SIZE.sm, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer',
            padding: isMobile ? '8px 0' : '4px 8px',
            minHeight: isMobile ? 44 : 'auto',
            display: 'flex', alignItems: 'center', order: isMobile ? 0 : 2,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
        >
          {isMobile ? '← Back' : 'Close →'}
        </button>
        {canEdit && h.ticker !== 'CASH' && !editing && (
          <button
            onClick={() => setEditing(true)}
            style={{
              fontSize: FONT_SIZE.sm, color: 'var(--acc)', background: 'none',
              border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer',
              padding: '4px 10px', order: 1,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            ✎ Edit
          </button>
        )}
      </div>

      {/* Edit — a single modal: position fields + legs together (admin only) */}
      {editing && <PositionEditor holding={h} onDone={() => setEditing(false)} />}

      <DetailPane
        title={<span style={{ color: tier.color }}>{h.ticker}</span>}
        subtitle={h.name}
        isMobile={isMobile}
        badges={
          <>
            <Badge kind="category" category={h.basket} />
            <Badge kind="action" action={h.last_action} />
            <span style={{ fontSize: FONT_SIZE['2xs'], padding: '2px 6px', borderRadius: 4, color: 'var(--t2)', background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
              Rank #{String(h.rank).padStart(2, '0')} / {totalCount}
            </span>
            <Badge kind="tier" tier={h.conviction} />
            {h.ticker !== 'CASH' && <RegimeBadge regime={regime} />}
            {h.action_date && (
              <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
                Last action {fmtDate(h.action_date)}
              </span>
            )}
          </>
        }
        metrics={h.ticker !== 'CASH' ? [
          { key: 'price', content: renderPriceContent() },
          { key: 'pnl', content: renderPnlContent() },
          { key: 'weight', content: renderWeightContent() },
        ] : undefined}
      >
        {/* CASH: show portfolio weight (can be negative = margin / leverage) */}
        {h.ticker === 'CASH' && (() => {
          const cw = h.current_weight ?? h.initial_weight ?? 0;
          return (
            <div style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
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

        {/* Conviction meter */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <DetailPaneMetricLabel>Conviction</DetailPaneMetricLabel>
            {ddDate && <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>Updated {ddDate}</div>}
          </div>
          <div style={{ display: 'flex', gap: 3 }}>{convSegs}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 3 }}>
            <span>Concern</span><span>Highest</span>
          </div>
        </div>

        {/* Thesis summary — the durable "why he's in it" (green card). The ↗ opens the
            original DD message (everyone sees it; Discord gates access). */}
        {h.summary && (
          <div style={{ position: 'relative', padding: '10px 12px', paddingRight: h.dd_source_url ? 30 : 12, borderRadius: 6, background: tier.bg, border: `1px solid ${tier.border}`, marginBottom: 12, fontSize: FONT_SIZE.base, color: 'var(--text)', lineHeight: 1.6 }}>
            {h.summary}
            <SourceLink url={h.dd_source_url} title="Open DD source message" style={{ position: 'absolute', top: 6, right: 6 }} />
          </div>
        )}

        {/* Thesis key points (part of the durable thesis, not the latest comment) */}
        {h.bullets && h.bullets.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <DetailPaneMetricLabel>Key Points{ddDate ? ` · ${ddDate}` : ''}</DetailPaneMetricLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {h.bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: FONT_SIZE.base, color: 'var(--t2)', lineHeight: 1.5 }}>
                  <span style={{ color: tier.color, flexShrink: 0, marginTop: 2 }}>◆</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commentary — one unified conviction_comments feed (host Discord/stream notes +
            subscriber personal notes), newest first. Replaces the old Latest Comments /
            Conviction Notes split. */}
        {showHistory && h.ticker !== 'CASH' && (
          <HistorySection title="Commentary">
            <ConvictionTimeline ticker={h.ticker} currentConviction={h.conviction} />
          </HistorySection>
        )}
        {/* Transaction History — the position's evolution, from leg_transactions (same source as the
            legs, so they can't disagree): position-level action per day + the per-leg events under it. */}
        {showHistory && h.ticker !== 'CASH' && (
          <HistorySection title="Transaction History">
            <LegTimeline ticker={h.ticker} legs={h.legs} />
          </HistorySection>
        )}
      </DetailPane>
    </div>
  );
}
