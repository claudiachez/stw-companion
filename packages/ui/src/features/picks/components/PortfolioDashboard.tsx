import { bColor, parseCostBasis, positionType, mergeLegs } from '@stw/shared';
import { usePriceCacheStore } from '../../../store/priceCache';
import { useRecentChanges } from '../useRecentChanges';
import type { Holding } from '../api';

const ET = { timeZone: 'America/New_York' };
const LEG_MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "202608" / "20260815" → "Aug '26" for the unpriced-legs summary.
function legExpiry(e: string): string {
  if (!e || e.length < 6) return e || '';
  return `${LEG_MONTHS[parseInt(e.slice(4, 6), 10)] ?? ''} '${e.slice(2, 4)}`;
}

interface DashboardProps {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
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
          <button
            onClick={() => onSelectTicker(bare.toUpperCase())}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--acc)', fontWeight: 600, fontSize: 'inherit', fontFamily: 'inherit',
            }}
          >
            {bare}
          </button>
          {trail}
        </span>
      );
    }
    return <span key={i}>{token}</span>;
  });
}

// ── Portfolio dashboard (shown when no ticker selected) ───────
export function PortfolioDashboard({ holdings, onSelectTicker }: DashboardProps) {
  const cache = usePriceCacheStore((s) => s.cache);
  const { data: changes } = useRecentChanges(1);
  const latestChange = changes?.[0] ?? null;

  const active = holdings.filter((h) => h.ticker !== 'CASH' && h.last_action !== 'Closed');

  // Avg P&L across positions that have cost basis + live price
  const pnlValues = active
    .map((h) => {
      const cost = parseCostBasis(h.position_detail);
      const price = cache[h.ticker]?.c;
      return cost && price ? (price - cost) / cost * 100 : null;
    })
    .filter((v): v is number => v !== null);
  const avgPnl = pnlValues.length > 0
    ? pnlValues.reduce((s, v) => s + v, 0) / pnlValues.length
    : null;

  // Equity : Options ratio by portfolio weight (matches the host's Friday update)
  // Mixed positions (shares + options overlay) count as equity weight
  let equityWeight = 0;
  let optionsWeight = 0;
  active.forEach((h) => {
    const w = h.current_weight ?? h.initial_weight ?? 0;
    const t = positionType(h.position_detail);
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

  // Options data freshness = newest IBKR pricing (last_pnl_at) across holdings.
  const optionsSynced = holdings.reduce<Date | null>((acc, h) => {
    if (!h.last_pnl_at) return acc;
    const d = new Date(h.last_pnl_at);
    return !acc || d > acc ? d : acc;
  }, null);

  // Portfolio-wide unpriced legs: parsed from position_detail but with no IBKR price.
  const unpricedLegs = holdings.flatMap((h) => {
    if (h.ticker === 'CASH' || h.last_action === 'Closed') return [];
    return mergeLegs(h.position_detail ?? '', h.ticker, h.ibkr_legs)
      .filter((l) => l.price == null)
      .map((l) => `${h.ticker} $${l.strike}${l.right} ${legExpiry(l.expiry)}`);
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

      {/* Sector distribution */}
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
              Updated{' '}
              <span style={{ color: 'var(--t2)' }}>
                {changeAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...ET })} ET
              </span>
            </div>
          )}
        </div>
      )}

      {/* Data freshness — distinct from the changes digest above */}
      <div style={{ marginTop: latestChange?.digest ? 12 : 24, fontSize: 11, color: 'var(--t3)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {lastUpdated && (
          <div>
            Holdings data synced:{' '}
            <span style={{ color: 'var(--t2)' }}>
              {lastUpdated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...ET })} ET
            </span>
          </div>
        )}
        {optionsSynced && (
          <div>
            Options data synced:{' '}
            <span style={{ color: 'var(--t2)' }}>
              {optionsSynced.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...ET })} ET
            </span>
          </div>
        )}
      </div>

      {/* Unpriced option legs — surfaced so they don't have to be hunted one-by-one */}
      {unpricedLegs.length > 0 && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c3)', marginBottom: 5 }}>
            ⚠ Unpriced Legs ({unpricedLegs.length})
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.6 }}>
            {unpricedLegs.join('  ·  ')}
          </div>
          <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4 }}>
            No IBKR price yet — run the IBKR sync, or check the contract in position detail.
          </div>
        </div>
      )}
    </div>
  );
}
