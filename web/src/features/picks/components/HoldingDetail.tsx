import type { Holding } from '../api';
import { TIERS, ACTION_VARS, bColor, parseCostBasis } from '../constants';
import { useQuote } from '../../../shared/hooks/useLivePrice';
import { usePriceCacheStore } from '../../../store/priceCache';

const ET = { timeZone: 'America/New_York' };

function PriceEmptyState({ fetchStatus }: { fetchStatus: string }) {
  if (fetchStatus === 'fetching') return <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>Loading…</div>;
  return <div style={{ fontSize: 12, color: 'var(--t3)' }}>Unavailable</div>;
}

function fmtDate(s: string | null): string {
  if (!s) return '–';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

interface Props {
  holding: Holding;
  totalCount: number;
  onClose: () => void;
  isMobile?: boolean;
}

export function HoldingDetail({ holding: h, totalCount, onClose, isMobile = false }: Props) {
  const quote = useQuote(h.ticker);
  const fetchStatus = usePriceCacheStore((s) => s.fetchStatus);
  const tier = TIERS[h.conviction] ?? TIERS[0];
  const action = ACTION_VARS[h.last_action];
  const basketColor = bColor(h.basket);

  // Live market col — Finnhub first, fall back to last_price stored by admin
  const livePrice = quote?.c ?? null;
  const price = livePrice ?? h.last_price ?? null;
  const isLive = livePrice != null;

  const dpStr = quote?.dp != null ? `${quote.dp >= 0 ? '+' : ''}${quote.dp.toFixed(2)}%` : null;
  const dpColor = (quote?.dp ?? 0) >= 0 ? '#16A34A' : '#DC2626';
  const hiloStr = (quote?.h && quote?.l) ? `H $${quote.h.toFixed(2)} · L $${quote.l.toFixed(2)}` : null;
  const srcTime = quote?.t
    ? new Date(quote.t * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...ET })
    : null;
  const lastPriceDate = h.last_price_at
    ? new Date(h.last_price_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...ET })
    : null;

  // P&L col
  const cost = parseCostBasis(h.position_detail);
  const pnlPct = cost && price ? (price - cost) / cost * 100 : null;
  const pnlColor = pnlPct != null ? (pnlPct >= 0 ? '#16A34A' : '#DC2626') : undefined;

  // Conviction segments
  const convSegs = [1, 2, 3, 4, 5].map((v) => (
    <div
      key={v}
      style={{
        flex: 1, height: 6, borderRadius: 3,
        background: v <= h.conviction ? tier.color : 'var(--border)',
      }}
    />
  ));

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Back / Close button */}
      <div style={{
        padding: '10px 16px 0',
        display: 'flex',
        justifyContent: isMobile ? 'flex-start' : 'flex-end',
      }}>
        <button
          onClick={onClose}
          style={{
            fontSize: 12,
            color: 'var(--t3)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: isMobile ? '8px 0' : '4px 8px',
            minHeight: isMobile ? 44 : 'auto',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
        >
          {isMobile ? '← Back' : 'Close →'}
        </button>
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

        {/* Badges row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 4,
            background: basketColor + '18', color: basketColor, border: `1px solid ${basketColor}28`,
          }}>
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

        {/* Data card — mobile: 2-col top row + full-width bottom; desktop: 3-col */}
        {h.ticker !== 'CASH' && (
          <div style={{ background: 'var(--s2)', border: '1px solid var(--bsub)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
            {isMobile ? (
              /* Mobile layout */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Row 1: Live Market + P&L side by side */}
                <div style={{ display: 'flex', gap: 0 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                      {isLive ? 'Live Market' : 'Last Price'}
                    </div>
                    {price ? (
                      <>
                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                          ${price.toFixed(2)}
                        </div>
                        {isLive && dpStr && <div style={{ fontSize: 11, fontWeight: 600, color: dpColor, marginTop: 2 }}>{dpStr}</div>}
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

                  <div style={{ flex: 1, borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                    <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                      Open P&L
                    </div>
                    {pnlPct != null ? (
                      <>
                        <div style={{ fontSize: 20, fontWeight: 700, color: pnlColor, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                          from ${cost!.toFixed(2)}
                        </div>
                      </>
                    ) : (
                      <PriceEmptyState fetchStatus={fetchStatus} />
                    )}
                  </div>
                </div>

                {/* Row 2: Entry → Weight full width */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Entry · Current Weight</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {h.initial_weight != null ? `${h.initial_weight.toFixed(1)}%` : '—'}
                    <span style={{ color: 'var(--t3)', fontWeight: 400, margin: '0 4px' }}>→</span>
                    {h.current_weight != null ? `${h.current_weight.toFixed(1)}%` : '—'}
                  </div>
                  {h.position_detail ? (
                    <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4, lineHeight: 1.5 }}>{h.position_detail}</div>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>detail pending</div>
                  )}
                </div>
              </div>
            ) : (
              /* Desktop layout: 3 equal columns */
              <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 90 }}>
                  <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                    {isLive ? 'Live Market' : 'Last Price'}
                  </div>
                  {price ? (
                    <>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                        ${price.toFixed(2)}
                      </div>
                      {isLive && dpStr && <div style={{ fontSize: 11, fontWeight: 600, color: dpColor, marginTop: 2 }}>{dpStr} today</div>}
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

                <div style={{ flex: 1, minWidth: 90, borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                  <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                    Open P&L (Shares)
                  </div>
                  {pnlPct != null ? (
                    <>
                      <div style={{ fontSize: 20, fontWeight: 700, color: pnlColor, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                        from ${cost!.toFixed(2)}
                      </div>
                    </>
                  ) : (
                    <PriceEmptyState fetchStatus={fetchStatus} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 90, borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                  <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Entry · Current Weight</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {h.initial_weight != null ? `${h.initial_weight.toFixed(1)}%` : '—'}
                    <span style={{ color: 'var(--t3)', fontWeight: 400, margin: '0 4px' }}>→</span>
                    {h.current_weight != null ? `${h.current_weight.toFixed(1)}%` : '—'}
                  </div>
                  {h.position_detail ? (
                    <div style={{ fontSize: 10, color: 'var(--t2)', marginTop: 4, lineHeight: 1.5 }}>{h.position_detail}</div>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>detail pending</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Conviction meter */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Conviction</div>
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
            <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Key Points from Stream</div>
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
