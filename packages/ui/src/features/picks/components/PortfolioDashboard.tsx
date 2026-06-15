import { bColor, holdingPnlPct, holdingType, legMarkReason, fmtLegInstrument, fmtDateTime } from '@stw/shared';
import { usePriceCacheStore } from '../../../store/priceCache';
import { useRecentChanges } from '../useRecentChanges';
import { useLatestWebinar } from '../useLatestWebinar';
import { TickerLink } from '../../../primitives/TickerLink';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { Holding } from '../api';

interface DashboardProps {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

// Date-only display for a conviction event_date (no time component) — matches ConvictionTimeline.
function fmtEventDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Render a digest string with any known ticker rendered as a clickable link.
function renderDigest(
  text: string,
  tickers: Set<string>,
  onSelectTicker?: (ticker: string) => void,
) {
  // Split keeping whitespace so spacing/newlines are preserved.
  return text.split(/(\s+)/).map((token, i) => {
    const bare = token.replace(/[^A-Za-z0-9.]/g, '');
    if (bare && tickers.has(bare.toUpperCase()) && onSelectTicker) {
      const lead = token.slice(0, token.indexOf(bare));
      const trail = token.slice(token.indexOf(bare) + bare.length);
      return (
        <span key={i}>
          {lead}
          <TickerLink ticker={bare.toUpperCase()} label={bare} onSelect={onSelectTicker} />
          {trail}
        </span>
      );
    }
    return <span key={i}>{token}</span>;
  });
}

// ── Portfolio dashboard (shown when no ticker selected) ───────
export function PortfolioDashboard({ holdings, onSelectTicker }: DashboardProps) {
  const isMobile = useIsMobile();
  const cache = usePriceCacheStore((s) => s.cache);
  const { data: changes } = useRecentChanges(1);
  const latestChange = changes?.[0] ?? null;
  const { data: webinar } = useLatestWebinar();

  const active = holdings.filter((h) => h.ticker !== 'CASH' && h.last_action !== 'Closed');

  // Avg P&L across positions with a resolvable return — each holding's weight-weighted P&L
  // across its legs (shares ride the live quote, options their stored IBKR mark).
  const pnlValues = active
    .map((h) => holdingPnlPct(h.legs, cache[h.ticker]?.c ?? null))
    .filter((v): v is number => v != null);
  const avgPnl = pnlValues.length > 0
    ? pnlValues.reduce((s, v) => s + v, 0) / pnlValues.length
    : null;

  // Equity : Options ratio by portfolio weight (matches the host's Friday update)
  // Mixed positions (shares + options overlay) count as equity weight
  let equityWeight = 0;
  let optionsWeight = 0;
  active.forEach((h) => {
    const w = h.current_weight ?? h.initial_weight ?? 0;
    const t = holdingType(h.legs);
    if (t === 'options') optionsWeight += w;
    else if (w > 0) equityWeight += w; // shares, mixed, or unclassified
  });
  const typeTotal = equityWeight + optionsWeight;
  const equityPct  = typeTotal > 0 ? Math.round(equityWeight  / typeTotal * 100) : null;
  const optionsPct = typeTotal > 0 ? Math.round(optionsWeight / typeTotal * 100) : null;

  // Sector distribution by weight
  const sectorMap: Record<string, number> = {};
  active.forEach((h) => {
    const w = h.current_weight ?? h.initial_weight ?? 0;
    sectorMap[h.basket] = (sectorMap[h.basket] ?? 0) + w;
  });
  const totalWeight = Object.values(sectorMap).reduce((s, v) => s + v, 0);
  const sectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);

  // Last updated across all holdings
  const lastUpdated = holdings.reduce<Date | null>((acc, h) => {
    if (!h.updated_at) return acc;
    const d = new Date(h.updated_at);
    return !acc || d > acc ? d : acc;
  }, null);

  // Options data freshness = newest IBKR leg mark across all holdings.
  const optionsSynced = holdings.reduce<Date | null>((acc, h) => {
    for (const leg of h.legs) {
      if (!leg.mark_price_at) continue;
      const d = new Date(leg.mark_price_at);
      if (!acc || d > acc) acc = d;
    }
    return acc;
  }, null);

  // Portfolio-wide unpriced option legs: open OPTION legs with no IBKR mark yet.
  const unpricedLegs = holdings.flatMap((h) => {
    if (h.ticker === 'CASH' || h.last_action === 'Closed') return [];
    return h.legs
      .filter((l) => l.instrument_type === 'OPTION' && l.status === 'OPEN' && l.mark_price == null)
      .map((l) => ({ ticker: h.ticker, label: fmtLegInstrument(l), reason: legMarkReason(l) }));
  });

  // Stale prices: an option leg marked in a PRIOR sync but not the latest one shows an old
  // price. mark_price_at is per-leg and stamped on a successful sync, so any priced leg older
  // than the newest mark is stale.
  const stalePrices = holdings.flatMap((h) => {
    if (h.ticker === 'CASH' || h.last_action === 'Closed' || !optionsSynced) return [];
    const stale = h.legs.filter(
      (l) => l.instrument_type === 'OPTION' && l.mark_price != null && l.mark_price_at != null &&
        new Date(l.mark_price_at).getTime() < optionsSynced.getTime(),
    );
    if (!stale.length) return [];
    const at = new Date(stale[0].mark_price_at!);
    const legs = stale.map((l) => fmtLegInstrument(l)).join(', ');
    return [{ ticker: h.ticker, label: `priced ${fmtDateTime(at)}: ${legs}` }];
  });

  const pnlColor = avgPnl != null ? (avgPnl >= 0 ? '#22c55e' : '#ef4444') : 'var(--t3)';

  const tickerSet = new Set(holdings.map((h) => h.ticker.toUpperCase()));
  const changeAt = latestChange?.ran_at ? new Date(latestChange.ran_at) : null;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 16 }}>
        Portfolio Overview
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {/* Holdings */}
        <div style={{ flex: 1, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{active.length}</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Active Holdings</div>
        </div>

        {/* Avg P&L */}
        <div style={{ flex: 1, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: pnlColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {avgPnl != null ? `${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
            Avg Return{pnlValues.length > 0 ? ` (${pnlValues.length} positions)` : ''}
          </div>
        </div>

        {/* Equity : Options weight ratio */}
        <div style={{ flex: 1, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', lineHeight: 1 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {equityPct ?? '—'}
            </span>
            <span style={{ fontSize: 18, color: 'var(--t3)', marginBottom: 1 }}>:</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
              {optionsPct ?? '—'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Equity : Options (by weight)</div>
        </div>
      </div>

      {/* Two-column grid on desktop — sector breakdown beside the activity feed so the
          wide overview tab isn't mostly empty space. Single column on mobile. */}
      <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? undefined : 'minmax(280px, 1fr) 1.4fr', gap: 32, alignItems: 'start' }}>

      {/* Left column — sector distribution */}
      <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>
        Sector Distribution
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {sectors.map(([name, w]) => {
          const pct = totalWeight > 0 ? (w / totalWeight) * 100 : 0;
          const c = bColor(name);
          return (
            <div key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)', minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: c, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginLeft: 8, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--border)' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: c, opacity: 0.85 }} />
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {/* Right column — activity + data status */}
      <div>

      {/* New webinar analysis — which positions had conviction notes refreshed by the latest stream */}
      {webinar && webinar.tickers.length > 0 && (
        <div style={{ marginTop: isMobile ? 28 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>
            New Webinar Analysis
          </div>
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'var(--s2)', border: '1px solid var(--acc)',
            fontSize: 13, color: 'var(--t2)', lineHeight: 1.6,
          }}>
            <div style={{ color: 'var(--text)', marginBottom: 8 }}>
              📺 Conviction notes updated for {webinar.tickers.length} {webinar.tickers.length === 1 ? 'position' : 'positions'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px' }}>
              {webinar.tickers.map((t) => (
                <TickerLink key={t} ticker={t} onSelect={onSelectTicker} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 10 }}>
              {fmtEventDate(webinar.eventDate)}
            </div>
          </div>
        </div>
      )}

      {/* Latest portfolio changes (digest) */}
      {latestChange?.digest && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>
            Latest Portfolio Changes
          </div>
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'var(--s2)', border: '1px solid var(--bsub)',
            fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
          }}>
            {renderDigest(latestChange.digest, tickerSet, onSelectTicker)}
          </div>
          {changeAt && (
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>
              Updated:{' '}
              <span style={{ color: 'var(--t2)' }}>{fmtDateTime(changeAt)}</span>
            </div>
          )}
        </div>
      )}

      {/* Data freshness — distinct from the changes digest above */}
      <div style={{ marginTop: latestChange?.digest ? 12 : 24, fontSize: 11, color: 'var(--t3)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {lastUpdated && (
          <div>
            Holdings data synced:{' '}
            <span style={{ color: 'var(--t2)' }}>{fmtDateTime(lastUpdated)}</span>
          </div>
        )}
        {optionsSynced && (
          <div>
            Options data synced:{' '}
            <span style={{ color: 'var(--t2)' }}>{fmtDateTime(optionsSynced)}</span>
          </div>
        )}
      </div>

      {/* Unpriced option legs — surfaced so they don't have to be hunted one-by-one */}
      {unpricedLegs.length > 0 && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c3)', marginBottom: 5 }}>
            ⚠ Unpriced Legs ({unpricedLegs.length})
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {unpricedLegs.map((u, i) => (
              <div key={i}>
                <TickerLink ticker={u.ticker} onSelect={onSelectTicker} /> {u.label}
                {u.reason && (
                  <span style={{ color: 'var(--t3)' }}>
                    {' — '}{u.reason.title}{u.reason.hint ? ` (${u.reason.hint})` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stale prices — priced before, but the latest sync didn't refresh them (still showing old prices) */}
      {stalePrices.length > 0 && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c2)', marginBottom: 5 }}>
            ◷ Stale Prices ({stalePrices.length})
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.6 }}>
            {stalePrices.map((s, i) => (
              <span key={i}>{i > 0 ? '  ·  ' : ''}<TickerLink ticker={s.ticker} onSelect={onSelectTicker} /> — {s.label}</span>
            ))}
          </div>
          <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4 }}>
            Showing prices from an earlier sync — the latest IBKR sync didn't refresh these. Re-run the sync.
          </div>
        </div>
      )}

      </div>{/* end right column */}
      </div>{/* end two-column grid */}
    </div>
  );
}
