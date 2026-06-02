import { bColor, parseCostBasis, positionType } from '@stw/shared';
import { usePriceCacheStore } from '../../../store/priceCache';
import type { Holding } from '../api';

const ET = { timeZone: 'America/New_York' };

// ── Portfolio dashboard (shown when no ticker selected) ───────
export function PortfolioDashboard({ holdings }: { holdings: Holding[] }) {
  const cache = usePriceCacheStore((s) => s.cache);

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

  const pnlColor = avgPnl != null ? (avgPnl >= 0 ? '#22c55e' : '#ef4444') : 'var(--t3)';

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

      {/* Last updated */}
      {lastUpdated && (
        <div style={{ marginTop: 24, fontSize: 11, color: 'var(--t3)' }}>
          Last synced:{' '}
          <span style={{ color: 'var(--t2)' }}>
            {lastUpdated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...ET })} ET
          </span>
        </div>
      )}
    </div>
  );
}
