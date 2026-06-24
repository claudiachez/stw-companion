import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserPositions, useIbkrSettings } from './useUserPositions';
import { useSyncPortfolio } from './useSyncPortfolio';
import { useHoldings } from '../picks/useHoldings';
import { ConvictionBadge } from '../picks/components/ConvictionBadge';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { TickerLink } from '../../primitives/TickerLink';
import {
  PortfolioFilterBar,
  DEFAULT_PORTFOLIO_FILTERS,
  type PortfolioFilters,
} from './PortfolioFilterBar';
import type { UserPosition } from './api';
import { cleanUnderlying } from './api';
import { fmtDateTime } from '@stw/shared';

function fmtMoney(n: number | null): string {
  if (n === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtExpiry(exp: string | null): string {
  if (!exp) return '';
  // YYYYMMDD → "Jan '25"
  const y = exp.slice(0, 4), m = exp.slice(4, 6), d = exp.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T12:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}


function pnlColor(pnl: number | null): string {
  if (pnl === null) return 'var(--t2)';
  return pnl >= 0 ? '#16A34A' : '#DC2626';
}

// ── aggregation ───────────────────────────────────────────────

interface PortfolioGroup {
  underlying:     string;
  positions:      UserPosition[];
  netPnl:         number;
  marketValue:    number;   // Σ mark · |qty| · multiplier
  costBasis:      number;
  isStwPick:      boolean;
  stwConviction:  number | null;
  hasStock:       boolean;
  hasOption:      boolean;
}

function positionMarketValue(p: UserPosition): number {
  return (p.mark_price ?? 0) * Math.abs(p.quantity ?? 0) * p.multiplier;
}

function positionCostBasis(p: UserPosition): number {
  if (p.avg_cost != null) return p.avg_cost * Math.abs(p.quantity ?? 0) * p.multiplier;
  // Fall back to (market value − unrealized P&L) when avg cost is missing.
  return positionMarketValue(p) - (p.unrealized_pnl ?? 0);
}

// ── sub-components ────────────────────────────────────────────

interface LegRowProps {
  pos: UserPosition;
  showPnl: boolean;
}

function LegRow({ pos, showPnl }: LegRowProps) {
  const isOpt = pos.asset_class === 'OPT';
  const qty = pos.quantity ?? 0;
  const label = isOpt
    ? `${Math.abs(qty)}× $${pos.strike}${pos.put_call} ${fmtExpiry(pos.expiry)}`
    : `${Math.abs(qty).toLocaleString()} share${Math.abs(qty) !== 1 ? 's' : ''} @ ${pos.avg_cost != null ? `$${pos.avg_cost.toFixed(2)}` : '—'}`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 14px 7px 36px',
      borderBottom: '1px solid var(--bsub)',
      background: 'var(--bg)',
    }}>
      {/* Left: badge + label — shrinks so right side always has room */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
          color: isOpt ? 'var(--c4)' : 'var(--t2)',
          background: isOpt ? 'var(--c4bg)' : 'var(--s2)',
          border: isOpt ? '1px solid var(--c4b)' : '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {isOpt ? `${qty < 0 ? 'SHORT ' : ''}${pos.put_call === 'C' ? 'CALL' : 'PUT'}` : 'STOCK'}
        </span>
        <span style={{
          fontSize: 12, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>

      {/* Right: P&L — never shrinks */}
      {showPnl && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {pos.unrealized_pnl_pct !== null && (
            <div style={{ fontSize: 12, fontWeight: 600, color: pnlColor(pos.unrealized_pnl_pct), fontVariantNumeric: 'tabular-nums' }}>
              {fmtPct(pos.unrealized_pnl_pct)}
            </div>
          )}
          {pos.unrealized_pnl !== null && (
            <div style={{ fontSize: 10, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtMoney(pos.unrealized_pnl)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface GroupRowProps {
  group: PortfolioGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectTicker: (ticker: string) => void;
  showPnl: boolean;
}

function GroupRow({ group, isExpanded, onToggle, onSelectTicker, showPnl }: GroupRowProps) {
  const { underlying, positions, netPnl, marketValue, isStwPick, stwConviction } = group;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center',
          gap: 8, padding: '10px 14px',
          borderBottom: '1px solid var(--bsub)',
          background: isExpanded ? 'var(--c5bg)' : 'var(--surface)',
          cursor: 'pointer',
          borderTop: '1px solid var(--border)',
        }}
        onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
        onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}
      >
        {/* Expand arrow */}
        <span style={{
          fontSize: 10, color: 'var(--t3)', flexShrink: 0,
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
          display: 'inline-block',
        }}>▶</span>

        {/* Left group: ticker + badges — shrinks so P&L always fits */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {isStwPick ? (
            // Stop propagation so tapping the ticker opens its detail instead of toggling the row.
            <span onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
              <TickerLink ticker={underlying} onSelect={onSelectTicker} style={{ fontSize: 14, fontWeight: 700 }} />
            </span>
          ) : (
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', flexShrink: 0 }}>
              {underlying}
            </span>
          )}
          {stwConviction !== null && (
            <ConvictionBadge level={stwConviction} />
          )}
          <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
            {positions.length === 1 ? '1 position' : `${positions.length} legs`}
          </span>
        </div>

        {/* Right: net P&L — never shrinks */}
        {showPnl && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: pnlColor(netPnl), fontVariantNumeric: 'tabular-nums' }}>
              {fmtMoney(netPnl)}
            </div>
            {marketValue > 0 && (
              <div style={{ fontSize: 10, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtMoney(marketValue)} mkt
              </div>
            )}
          </div>
        )}
      </div>

      {isExpanded && positions.map((p) => <LegRow key={p.id} pos={p} showPnl={showPnl} />)}
    </>
  );
}

// ── summary header ────────────────────────────────────────────

interface SummaryProps {
  groups: PortfolioGroup[];
  showPnl: boolean;
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: '1 1 96px', minWidth: 96 }}>
      <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: color ?? 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{sub}</div>}
    </div>
  );
}

function PortfolioSummary({ groups, showPnl }: SummaryProps) {
  const totals = useMemo(() => {
    let marketValue = 0, pnl = 0, costBasis = 0, legs = 0, stwPicks = 0, lowConviction = 0;
    for (const g of groups) {
      marketValue += g.marketValue;
      pnl += g.netPnl;
      costBasis += g.costBasis;
      legs += g.positions.length;
      if (g.isStwPick) {
        stwPicks += 1;
        // Concern (1) or Waning (2) — a heads-up that STW's conviction is low/declining.
        if (g.stwConviction === 1 || g.stwConviction === 2) lowConviction += 1;
      }
    }
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : null;
    return { marketValue, pnl, pnlPct, legs, stwPicks, lowConviction };
  }, [groups]);

  const positionCount = groups.length;

  return (
    <div style={{ margin: 16, marginBottom: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
        padding: '14px 16px', borderRadius: 8,
        background: 'var(--surface)', border: '1px solid var(--border)',
      }}>
        {showPnl && (
          <>
            <Stat label="Market Value" value={fmtMoney(totals.marketValue)} />
            <Stat
              label="Unrealized P&L"
              value={fmtMoney(totals.pnl)}
              sub={totals.pnlPct !== null ? fmtPct(totals.pnlPct) : undefined}
              color={pnlColor(totals.pnl)}
            />
          </>
        )}
        <Stat
          label="Positions"
          value={String(positionCount)}
          sub={`${totals.legs} leg${totals.legs === 1 ? '' : 's'}`}
        />
      </div>

      {/* STW-overlap callout */}
      {positionCount > 0 && (
        <div style={{ fontSize: 11, color: 'var(--t2)', padding: '8px 4px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span>
            <strong style={{ color: 'var(--text)' }}>{totals.stwPicks}</strong> of {positionCount} {positionCount === 1 ? 'position is' : 'positions are'} an STW pick
          </span>
          {totals.lowConviction > 0 && (
            <span style={{ color: 'var(--c1)' }}>
              · ⚠ {totals.lowConviction} with low / declining conviction
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────

export function PortfolioPage() {
  const navigate = useNavigate();
  const { data: positions = [], isLoading: posLoading } = useUserPositions();
  const { data: settings } = useIbkrSettings();
  const { data: stwHoldings = [] } = useHoldings();
  const { sync, isSyncing, syncError, lastResult } = useSyncPortfolio();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showPnl, setShowPnl] = useState(true);
  const [filters, setFilters] = useState<PortfolioFilters>(DEFAULT_PORTFOLIO_FILTERS);

  const isConnected = !!(settings?.ibkr_flex_token && settings?.ibkr_query_id);

  // Map STW ticker → conviction for badge lookup
  const stwMap = useMemo(
    () => new Map(stwHoldings.map((h) => [h.ticker, h.conviction])),
    [stwHoldings],
  );

  // Group positions by underlying, normalising any OCC symbols still in the DB,
  // and derive each group's aggregates once.
  const allGroups = useMemo<PortfolioGroup[]>(() => {
    const map = new Map<string, UserPosition[]>();
    for (const p of positions) {
      const key = cleanUnderlying(p.underlying);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).map(([underlying, legs]) => ({
      underlying,
      positions: legs,
      netPnl: legs.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0),
      marketValue: legs.reduce((s, p) => s + positionMarketValue(p), 0),
      costBasis: legs.reduce((s, p) => s + positionCostBasis(p), 0),
      isStwPick: stwMap.has(underlying),
      stwConviction: stwMap.has(underlying) ? (stwMap.get(underlying) ?? null) : null,
      hasStock: legs.some((p) => p.asset_class !== 'OPT'),
      hasOption: legs.some((p) => p.asset_class === 'OPT'),
    }));
  }, [positions, stwMap]);

  // Filtered + sorted view (the summary reads the full portfolio, not the filtered set).
  const visibleGroups = useMemo<PortfolioGroup[]>(() => {
    const filtered = allGroups.filter((g) => {
      if (filters.stwOnly && !g.isStwPick) return false;
      if (filters.type === 'stocks' && !g.hasStock) return false;
      if (filters.type === 'options' && !g.hasOption) return false;
      return true;
    });
    const dir = filters.sort.endsWith('_asc') ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (filters.sort) {
        case 'pnl_desc':
        case 'pnl_asc':
          return (a.netPnl - b.netPnl) * dir;
        case 'value_desc':
        case 'value_asc':
          return (a.marketValue - b.marketValue) * dir;
        case 'az':
          return a.underlying.localeCompare(b.underlying);
        case 'za':
          return b.underlying.localeCompare(a.underlying);
        default:
          return 0;
      }
    });
  }, [allGroups, filters]);

  // Last synced timestamp: most recent across all positions
  const lastSynced = useMemo(() => {
    if (lastResult) return lastResult.lastSyncedAt;
    if (positions.length === 0) return null;
    return positions.reduce((max, p) =>
      p.last_synced_at > max ? p.last_synced_at : max, positions[0].last_synced_at);
  }, [positions, lastResult]);

  function toggleGroup(underlying: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(underlying)) next.delete(underlying);
      else next.add(underlying);
      return next;
    });
  }

  const onSelectTicker = (ticker: string) => navigate(`/picks?ticker=${encodeURIComponent(ticker)}`);

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid var(--bsub)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>
          {lastSynced ? `Last synced: ${fmtDateTime(lastSynced)}` : 'Not synced yet'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowPnl((v) => !v)}
            title={showPnl ? 'Hide P&L' : 'Show P&L'}
            style={{
              width: 34, height: 34, borderRadius: 6, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: '1px solid var(--border)',
              color: showPnl ? 'var(--t2)' : 'var(--t3)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {showPnl ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            )}
          </button>
        <button
          onClick={sync}
          disabled={isSyncing || !isConnected}
          style={{
            padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: isConnected ? 'var(--acc)' : 'var(--s2)',
            color: isConnected ? '#fff' : 'var(--t3)',
            border: 'none', cursor: isConnected ? 'pointer' : 'default',
            opacity: isSyncing ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {isSyncing ? 'Syncing…' : 'Sync'}
        </button>
        </div>
      </div>

      {syncError && (
        <div style={{
          margin: '0 16px 12px', padding: '10px 14px', borderRadius: 6,
          background: '#2d0c0c', border: '1px solid var(--c1b)',
          color: 'var(--c1)', fontSize: 12,
        }}>
          {syncError}
        </div>
      )}

      {/* Not connected */}
      {!isConnected && (
        <div style={{
          margin: 16, padding: '24px', borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 12 }}>
            Connect your IBKR account to see your positions here.
          </div>
          <button
            onClick={() => navigate('/settings')}
            style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: 'var(--acc)', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            Go to Settings →
          </button>
        </div>
      )}

      {/* Loading */}
      {isConnected && posLoading && <LoadingSpinner className="mt-16" />}

      {/* No positions yet */}
      {isConnected && !posLoading && positions.length === 0 && (
        <div style={{
          margin: 16, padding: '24px', borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 6 }}>
            No positions loaded yet.
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            Click Sync to fetch your current IBKR positions.
          </div>
        </div>
      )}

      {/* Summary + filter + accordion */}
      {allGroups.length > 0 && (
        <>
          <PortfolioSummary groups={allGroups} showPnl={showPnl} />

          <PortfolioFilterBar
            filters={filters}
            onChange={setFilters}
            filtered={visibleGroups.length}
            total={allGroups.length}
          />

          {visibleGroups.length > 0 ? (
            <div style={{
              margin: 16, borderRadius: 8, overflow: 'hidden',
              border: '1px solid var(--border)',
            }}>
              {visibleGroups.map((g) => (
                <GroupRow
                  key={g.underlying}
                  group={g}
                  isExpanded={expanded.has(g.underlying)}
                  onToggle={() => toggleGroup(g.underlying)}
                  onSelectTicker={onSelectTicker}
                  showPnl={showPnl}
                />
              ))}
            </div>
          ) : (
            <div style={{ margin: 16, padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
              No positions match your filters.
            </div>
          )}
        </>
      )}
    </div>
    </div>
  );
}
