import { useState } from 'react';
import type { Holding } from '../api';
import { TIERS, ACTION_VARS, bColor, parseCostBasis, positionType, resolvePnl, mergeLegs, legPriceReason } from '@stw/shared';
import { useQuote } from '../../../hooks/useLivePrice';
import { usePriceCacheStore } from '../../../store/priceCache';
import { useCapabilities } from '../../../context/AppCapabilities';
import { HoldingEditForm } from './HoldingEditForm';

const ET = { timeZone: 'America/New_York' };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function PriceEmptyState({ fetchStatus }: { fetchStatus: string }) {
  if (fetchStatus === 'fetching') return <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>Loading…</div>;
  return <div style={{ fontSize: 12, color: 'var(--t3)' }}>Unavailable</div>;
}

function fmtDate(s: string | null): string {
  if (!s) return '–';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// One canonical "as of" stamp used for every price/P&L source label so they read
// identically everywhere: "May 26, 10:18 PM".
function fmtStamp(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...ET });
}

function fmtExpiry(expiry: string): string {
  if (expiry.length < 6) return expiry;
  const yr  = expiry.slice(2, 4);
  const mo  = parseInt(expiry.slice(4, 6), 10) - 1;
  const day = expiry.length === 8 ? parseInt(expiry.slice(6, 8), 10) : null;
  const mon = MONTHS[mo] ?? '';
  return day ? `${mon} ${day} '${yr}` : `${mon} '${yr}`;
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
  const { canEdit } = useCapabilities();
  const [editing, setEditing] = useState(false);
  const quote       = useQuote(h.ticker);
  const fetchStatus = usePriceCacheStore((s) => s.fetchStatus);
  const tier        = TIERS[h.conviction] ?? TIERS[0];
  const action      = ACTION_VARS[h.last_action];
  const basketColor = bColor(h.basket);
  const pType       = positionType(h.position_detail);

  // ── Price (Finnhub live → last_price fallback) ────────────
  const livePrice   = quote?.c ?? null;
  const price       = livePrice ?? h.last_price ?? null;
  const isLive      = livePrice != null;
  const dpStr       = quote?.dp != null ? `${quote.dp >= 0 ? '+' : ''}${quote.dp.toFixed(2)}%` : null;
  const dpColor     = (quote?.dp ?? 0) >= 0 ? '#16A34A' : '#DC2626';
  const hiloStr     = (quote?.h && quote?.l) ? `H $${quote.h.toFixed(2)} · L $${quote.l.toFixed(2)}` : null;
  // All three carry the same "Mon D, H:MM AM/PM" stamp (see fmtStamp).
  const srcTime     = quote?.t ? fmtStamp(new Date(quote.t * 1000)) : null;      // Finnhub quote time
  const lastPriceDate = h.last_price_at ? fmtStamp(new Date(h.last_price_at)) : null; // admin last-set price

  // ── P&L — resolved via shared logic (shares / options / mixed) ──
  const cost = parseCostBasis(h.position_detail);
  const { equityPnl, optionsPnl, pnlPct } = resolvePnl({
    positionType: pType,
    price,
    costBasis: cost,
    optionsPnlPct: h.last_pnl_pct,
  });
  const ibkrDate = h.last_pnl_at ? fmtStamp(new Date(h.last_pnl_at)) : null; // IBKR proxy pricing time (the price's own date)
  const ddDate   = h.dd_updated_at ? fmtStamp(new Date(h.dd_updated_at)) : null; // DD/conviction last refreshed
  // Stale: this ticker was priced in an earlier sync than the portfolio's newest, so its
  // options price/P&L is old — the date shown is when THIS price was captured, not "now".
  const ibkrStale =
    (pType === 'options' || pType === 'mixed') &&
    h.last_pnl_at != null && latestOptionsSync != null &&
    new Date(h.last_pnl_at).getTime() < latestOptionsSync.getTime();
  const pnlColor = pnlPct != null ? (pnlPct >= 0 ? '#16A34A' : '#DC2626') : undefined;

  // ── Options legs ─────────────────────────────────────────
  // Show EVERY leg parsed from position_detail, overlaying IBKR price/P&L where the
  // proxy priced it (shared mergeLegs). Legs the proxy couldn't resolve still appear
  // unpriced, so a multi-leg position never silently hides a leg.
  const legs = mergeLegs(h.position_detail ?? '', h.ticker, h.ibkr_legs);
  const validLegs = legs.filter((l) => l.price != null);

  // ── P&L source line(s) ───────────────────────────────────
  // Name the actual data source, each with its own "as of" stamp. Shares ride the
  // live Finnhub price (or the last-synced price); options come from IBKR. A mixed
  // position shows BOTH lines, since the two halves refresh on different clocks.
  const sharesSrc = isLive
    ? (srcTime ? `Finnhub · ${srcTime}` : 'Finnhub')
    : (lastPriceDate ? `Last sync · ${lastPriceDate}` : null);
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
              {isLive
                ? (srcTime ? `Finnhub · ${srcTime}` : 'Finnhub')
                : (lastPriceDate ? `Last sync · ${lastPriceDate}` : 'Last sync')}
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
    const exitPct = h.exit_pnl_pct;
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
            <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4, opacity: 0.8 }}>
              {h.exit_price != null ? `Realized · exit $${h.exit_price.toFixed(2)}` : 'Realized'}
            </div>
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
            {pType === 'options' && legs.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                {validLegs.length} of {legs.length} leg{legs.length > 1 ? 's' : ''} priced
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
    return (
      <div style={{ flex: 1, ...(withBorder ? colBorder : {}) }}>
        <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
          Entry · Current Weight
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          {h.initial_weight != null ? `${h.initial_weight.toFixed(1)}%` : '—'}
          <span style={{ color: 'var(--t3)', fontWeight: 400, margin: '0 4px' }}>→</span>
          {h.current_weight != null ? `${h.current_weight.toFixed(1)}%` : '—'}
        </div>
        {h.position_detail ? (
          <div style={{ fontSize: isMobile ? 11 : 10, color: 'var(--t2)', marginTop: 4, lineHeight: 1.5 }}>
            {h.position_detail}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>detail pending</div>
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
        <div style={{ display: 'flex', gap: 0 }}>
          {equityPnl != null && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 3 }}>Shares</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: equityPnl >= 0 ? '#16A34A' : '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                {equityPnl >= 0 ? '+' : ''}{equityPnl.toFixed(1)}%
              </div>
              {cost && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>from ${cost.toFixed(2)}</div>}
            </div>
          )}
          {optionsPnl != null && (
            <div style={{ flex: 1, ...(equityPnl != null ? colBorder : {}) }}>
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
        </div>
        {legs.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
            {renderLegRows()}
          </div>
        )}
      </div>
    );
  }

  // Leg rows (entry → price, P&L, unpriced reason). Rendered inside the P&L Breakdown
  // card for mixed positions; as their own section for options-only positions.
  function renderLegRows() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {legs.map((leg, i) => {
            const lColor      = leg.pnl_pct != null ? (leg.pnl_pct >= 0 ? '#16A34A' : '#DC2626') : 'var(--t3)';
            const perContract = leg.price != null ? (leg.price - leg.entry) * 100 : null;
            const reason      = legPriceReason(leg); // why this leg has no price (if so)
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderRadius: 5,
                background: 'var(--s2)', border: '1px solid var(--bsub)',
                fontSize: 11, gap: 8,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      ${leg.strike}{leg.right}
                    </span>
                    <span style={{ color: 'var(--t3)' }}>{fmtExpiry(leg.expiry)}</span>
                  </div>
                  {reason && (
                    <span style={{ fontSize: 9, color: 'var(--c3)', lineHeight: 1.3 }}>
                      {reason.title}{reason.hint ? ` · ${reason.hint}` : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
                    ${leg.entry.toFixed(2)} → {leg.price != null ? `$${leg.price.toFixed(2)}` : '—'}
                  </span>
                  {leg.pnl_pct != null && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: lColor, fontVariantNumeric: 'tabular-nums' }}>
                        {leg.pnl_pct >= 0 ? '+' : ''}{leg.pnl_pct.toFixed(1)}%
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
    if (pType !== 'options' || legs.length === 0) return null;
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
              padding: '4px 10px', order: isMobile ? 1 : 1,
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

        {/* Edit form (admin only, when toggled) */}
        {editing && <HoldingEditForm holding={h} onDone={() => setEditing(false)} />}

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

        {/* Summary */}
        {h.summary && (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: tier.bg, border: `1px solid ${tier.border}`, marginBottom: 12, fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
            {h.summary}
          </div>
        )}

        {/* Bullets */}
        {h.bullets && h.bullets.length > 0 && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              Key Points from Stream{ddDate ? ` · ${ddDate}` : ''}
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
      </div>
    </div>
  );
}
