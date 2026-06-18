import { useState } from 'react';
import type { Holding } from '../api';
import {
  TIERS, ACTION_VARS, bColor, fmtDateTime,
  holdingType, holdingPnlPct, legIsOpen, legUnrealizedPnlPct, legMarkReason,
  fmtOptionExpiry, fmtLegInstrument, positionWeight,
} from '@stw/shared';
import { useQuote } from '../../../hooks/useLivePrice';
import { usePriceCacheStore } from '../../../store/priceCache';
import { useCapabilities } from '../../../context/AppCapabilities';
import { PositionEditor } from './PositionEditor';
import { LegTimeline } from './LegTimeline';
import { ConvictionTimeline } from './ConvictionTimeline';

function PriceEmptyState({ fetchStatus }: { fetchStatus: string }) {
  if (fetchStatus === 'fetching') return <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>Loading…</div>;
  return <div style={{ fontSize: 12, color: 'var(--t3)' }}>Unavailable</div>;
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
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
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
}

export function HoldingDetail({ holding: h, totalCount, onClose, isMobile = false, latestOptionsSync = null }: Props) {
  const { canEdit, canViewHistory, isAdmin } = useCapabilities();
  const showHistory = canViewHistory || isAdmin;
  const [editing, setEditing] = useState(false);

  const quote       = useQuote(h.ticker);
  const fetchStatus = usePriceCacheStore((s) => s.fetchStatus);
  const tier        = TIERS[h.conviction] ?? TIERS[0];
  const action      = ACTION_VARS[h.last_action];
  const basketColor = bColor(h.basket);
  const pType       = holdingType(h.legs);

  // ── Price (Finnhub live underlying) ───────────────────────
  const livePrice   = quote?.c ?? null;
  const price       = livePrice;
  const isLive      = livePrice != null;
  const dpStr       = quote?.dp != null ? `${quote.dp >= 0 ? '+' : ''}${quote.dp.toFixed(2)}%` : null;
  const dpColor     = (quote?.dp ?? 0) >= 0 ? '#16A34A' : '#DC2626';
  const hiloStr     = (quote?.h && quote?.l) ? `H $${quote.h.toFixed(2)} · L $${quote.l.toFixed(2)}` : null;
  // All carry the established fmtDateTime stamp ("Mon D · H:MM AM ET").
  const srcTime     = quote?.t ? fmtDateTime(new Date(quote.t * 1000)) : null;   // Finnhub quote time

  // ── Legs (the %-P&L source of truth) ──────────────────────
  const openLegs   = h.legs.filter(legIsOpen);
  const closedLegs = h.legs.filter((l) => !legIsOpen(l));
  const optionLegs = h.legs.filter((l) => l.instrument_type === 'OPTION');
  const shareLegs  = h.legs.filter((l) => l.instrument_type === 'SHARES');
  const validLegs  = optionLegs.filter((l) => l.mark_price != null); // priced by IBKR

  // ── P&L — weight-weighted across legs ─────────────────────
  const pnlPct     = holdingPnlPct(openLegs, livePrice);
  const equityPnl  = holdingPnlPct(shareLegs, livePrice);
  const optionsPnl = holdingPnlPct(optionLegs, livePrice);
  const pnlColor   = pnlPct != null ? (pnlPct >= 0 ? '#16A34A' : '#DC2626') : undefined;

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
  const colBorder: React.CSSProperties = { borderLeft: '1px solid var(--border)', paddingLeft: 12 };

  function renderPriceCol(withBorder = false) {
    return (
      <div style={{ flex: 1, ...(withBorder ? colBorder : {}) }}>
        <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
          {isLive ? 'Live Market' : 'Last Price'}
        </div>
        {price ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              ${price.toFixed(2)}
            </div>
            {isLive && dpStr  && <div style={{ fontSize: 11, fontWeight: 600, color: dpColor, marginTop: 2 }}>{dpStr}</div>}
            {isLive && hiloStr && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{hiloStr}</div>}
            <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4, opacity: 0.8 }}>
              {srcTime ? `Finnhub · ${srcTime}` : 'Finnhub'}
            </div>
          </>
        ) : (
          <PriceEmptyState fetchStatus={fetchStatus} />
        )}
      </div>
    );
  }

  const isClosed = h.last_action === 'Closed';

  function renderClosedPnlCol(withBorder = true) {
    // Weighted realized % across the closed legs.
    const exitPct = holdingPnlPct(closedLegs, livePrice);
    const exitColor = exitPct != null ? (exitPct >= 0 ? '#16A34A' : '#DC2626') : undefined;
    return (
      <div style={{ flex: 1, ...(withBorder ? colBorder : {}) }}>
        <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
          Close P&L
        </div>
        {exitPct != null ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: exitColor, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {exitPct >= 0 ? '+' : ''}{exitPct.toFixed(1)}%
            </div>
            <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4, opacity: 0.8 }}>Realized</div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>Position closed</div>
        )}
      </div>
    );
  }

  function renderPnlCol(withBorder = true) {
    if (isClosed) return renderClosedPnlCol(withBorder);
    const label = pType === 'mixed' ? 'Avg P&L' : 'Open P&L';
    const srcLines = pnlSrcLines();
    return (
      <div style={{ flex: 1, ...(withBorder ? colBorder : {}) }}>
        <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
          {label}
        </div>
        {pnlPct != null ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: pnlColor, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
            </div>
            {pType === 'options' && optionLegs.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                {validLegs.length} of {optionLegs.length} leg{optionLegs.length > 1 ? 's' : ''} priced
              </div>
            )}
            {srcLines.map((line, i) => (
              <div key={i} style={{ fontSize: 9, color: line.stale ? 'var(--c3)' : 'var(--t3)', marginTop: i === 0 ? 4 : 1, opacity: line.stale ? 1 : 0.8 }}>{line.text}</div>
            ))}
          </>
        ) : (
          (pType === 'options' || pType === 'mixed')
            ? <div style={{ fontSize: 12, color: 'var(--t3)' }}>No IBKR data</div>
            : <PriceEmptyState fetchStatus={fetchStatus} />
        )}
      </div>
    );
  }

  function renderWeightCol(withBorder = true) {
    // initial = the host's stated opening size (stored); current = Σ open legs (derived).
    const curWeight = positionWeight(h.legs).current;
    return (
      <div style={{ flex: 1, ...(withBorder ? colBorder : {}) }}>
        <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
          Entry · Current Weight
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          {h.initial_weight != null ? `${h.initial_weight.toFixed(1)}%` : '—'}
          <span style={{ color: 'var(--t3)', fontWeight: 400, margin: '0 4px' }}>→</span>
          {curWeight != null ? `${curWeight}%` : '—'}
        </div>
        {openLegs.length > 0 ? (
          /* one OPEN leg per line — closed legs live in Transaction History */
          <div style={{ fontSize: isMobile ? 11 : 10, color: 'var(--t2)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {openLegs.map((l) => (
              <div key={l.id} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {l.weight != null && <span style={{ color: 'var(--text)', fontWeight: 600 }}>{l.weight}% </span>}
                {l.instrument_type === 'SHARES' ? 'Shares' : fmtLegInstrument(l)}
                {l.instrument_type === 'SHARES' && l.entry_price != null ? ` @ $${l.entry_price}` : ''}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>no open legs</div>
        )}
      </div>
    );
  }

  function renderPnlBreakdown() {
    if (pType !== 'mixed') return null;
    if (equityPnl == null && optionsPnl == null) return null;
    return (
      <div style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          P&L Breakdown
        </div>
        {/* Shares 25% · Options 25% · Options Detail 50% (stacks on mobile). */}
        <div style={{ display: 'flex', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? 10 : 0, alignItems: 'flex-start' }}>
          {equityPnl != null && (
            <div style={{ flex: isMobile ? '1 1 40%' : '0 0 25%' }}>
              <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 3 }}>Shares</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: equityPnl >= 0 ? '#16A34A' : '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                {equityPnl >= 0 ? '+' : ''}{equityPnl.toFixed(1)}%
              </div>
              {shareLegs[0]?.entry_price != null && (
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>from ${shareLegs[0].entry_price!.toFixed(2)}</div>
              )}
            </div>
          )}
          {optionsPnl != null && (
            <div style={{ flex: isMobile ? '1 1 40%' : '0 0 25%', ...(equityPnl != null && !isMobile ? colBorder : {}) }}>
              <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 3 }}>Options</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: optionsPnl >= 0 ? '#16A34A' : '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                {optionsPnl >= 0 ? '+' : ''}{optionsPnl.toFixed(1)}%
              </div>
              {validLegs.length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                  {validLegs.length} leg{validLegs.length > 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
          {optionLegs.length > 0 && (
            <div style={{ flex: isMobile ? '1 1 100%' : '1 1 50%', ...(isMobile ? { borderTop: '1px solid var(--border)', paddingTop: 10 } : colBorder) }}>
              <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 3 }}>Options Detail</div>
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
        {optionLegs.map((leg) => {
          const right       = leg.option_right === 'PUT' ? 'P' : 'C';
          const pnl         = legUnrealizedPnlPct(leg, livePrice);
          const mark        = leg.mark_price;
          const entry       = leg.entry_price;
          const lColor      = pnl != null ? (pnl >= 0 ? '#16A34A' : '#DC2626') : 'var(--t3)';
          const perContract = mark != null && entry != null ? (mark - entry) * 100 : null;
          const reason      = legMarkReason(leg);
          return (
            <div key={leg.id} style={{ fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>${leg.option_strike}{right}</span>
                  <span style={{ color: 'var(--t3)', marginLeft: 6 }}>{fmtOptionExpiry(leg.option_expiry)}</span>
                </span>
                {pnl != null && (
                  <span style={{ fontWeight: 700, color: lColor, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                  </span>
                )}
              </div>
              {mark != null && entry != null ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10, color: 'var(--t3)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                  <span>${entry.toFixed(2)} → ${mark.toFixed(2)}</span>
                  {perContract != null && (
                    <span style={{ flexShrink: 0 }}>{perContract >= 0 ? '+' : ''}${Math.abs(perContract).toFixed(0)}/ct</span>
                  )}
                </div>
              ) : (
                reason && (
                  <div style={{ fontSize: 9, color: 'var(--c3)', marginTop: 1, lineHeight: 1.3 }}>
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
        {optionLegs.map((leg) => {
            const right       = leg.option_right === 'PUT' ? 'P' : 'C';
            const pnl         = legUnrealizedPnlPct(leg, livePrice);
            const mark        = leg.mark_price;
            const entry       = leg.entry_price;
            const lColor      = pnl != null ? (pnl >= 0 ? '#16A34A' : '#DC2626') : 'var(--t3)';
            const perContract = mark != null && entry != null ? (mark - entry) * 100 : null;
            const reason      = legMarkReason(leg); // why this leg has no mark (if so)
            return (
              <div key={leg.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderRadius: 5,
                background: 'var(--s2)', border: '1px solid var(--bsub)',
                fontSize: 11, gap: 8,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      ${leg.option_strike}{right}
                    </span>
                    <span style={{ color: 'var(--t3)' }}>{fmtOptionExpiry(leg.option_expiry)}</span>
                  </div>
                  {reason && (
                    <span style={{ fontSize: 9, color: 'var(--c3)', lineHeight: 1.3 }}>
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
                      <div style={{ fontWeight: 700, color: lColor, fontVariantNumeric: 'tabular-nums' }}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                      </div>
                      {perContract != null && (
                        <div style={{ fontSize: 9, color: 'var(--t3)' }}>
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
    if (pType !== 'options' || optionLegs.length === 0) return null;
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Options Legs
        </div>
        {renderLegRows()}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Back / Close + Edit buttons */}
      <div style={{ padding: '10px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={onClose}
          style={{
            fontSize: 12, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer',
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
              fontSize: 12, color: 'var(--acc)', background: 'none',
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

      <div style={{ padding: '8px 16px 24px', flex: 1 }}>
        {/* Header: ticker + name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 4, height: 44, borderRadius: 2, background: tier.color, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: tier.color, lineHeight: 1.1 }}>{h.ticker}</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 1 }}>{h.name}</div>
          </div>
          {h.action_date && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {isMobile ? '' : 'Last Action'}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--t2)' }}>{fmtDate(h.action_date)}</div>
            </div>
          )}
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: basketColor + '18', color: basketColor, border: `1px solid ${basketColor}28` }}>
            ● {h.basket}
          </span>
          {action && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, color: action.color, background: action.bg }}>
              {h.last_action}
            </span>
          )}
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, color: 'var(--t2)', background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
            Rank #{String(h.rank).padStart(2, '0')} / {totalCount}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, color: tier.color, background: tier.bg, border: `1px solid ${tier.border}` }}>
            {tier.short}
          </span>
        </div>

        {/* Edit — a single modal: position fields + legs together (admin only) */}
        {editing && <PositionEditor holding={h} onDone={() => setEditing(false)} />}

        {/* Data card */}
        {h.ticker !== 'CASH' && (
          <div style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Row 1: Price + P&L side by side */}
                <div style={{ display: 'flex', gap: 0 }}>
                  {renderPriceCol(false)}
                  {renderPnlCol(true)}
                </div>
                {/* Row 2: Weight full width */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  {renderWeightCol(false)}
                </div>
              </div>
            ) : (
              /* Desktop: 3 equal columns */
              <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
                {renderPriceCol(false)}
                {renderPnlCol(true)}
                {renderWeightCol(true)}
              </div>
            )}
          </div>
        )}

        {/* CASH: show portfolio weight (can be negative = margin / leverage) */}
        {h.ticker === 'CASH' && (() => {
          const cw = h.current_weight ?? h.initial_weight ?? 0;
          return (
            <div style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                Portfolio Weight
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: cw < 0 ? '#DC2626' : 'var(--text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                {cw.toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
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
            <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Conviction</div>
            {ddDate && <div style={{ fontSize: 9, color: 'var(--t3)' }}>Updated {ddDate}</div>}
          </div>
          <div style={{ display: 'flex', gap: 3 }}>{convSegs}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--t3)', marginTop: 3 }}>
            <span>Concern</span><span>Highest</span>
          </div>
        </div>

        {/* Thesis summary — the durable "why he's in it" (green card) */}
        {h.summary && (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: tier.bg, border: `1px solid ${tier.border}`, marginBottom: 12, fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
            {h.summary}
          </div>
        )}

        {/* Thesis key points (part of the durable thesis, not the latest comment) */}
        {h.bullets && h.bullets.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              Key Points{ddDate ? ` · ${ddDate}` : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {h.bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>
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
      </div>
    </div>
  );
}
