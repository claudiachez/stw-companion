import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIERS } from '@stw/shared';
import { fmtDateTime } from '@stw/shared';
import { useUserPositions, useIbkrSettings } from './useUserPositions';
import { useSyncPortfolio } from './useSyncPortfolio';
import { useHoldings } from '../picks/useHoldings';
import { ConvictionBadge } from '../picks/components/ConvictionBadge';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { TickerLink } from '../../primitives/TickerLink';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  PortfolioFilterBar,
  DEFAULT_PORTFOLIO_FILTERS,
  type PortfolioFilters,
} from './PortfolioFilterBar';
import type { UserPosition } from './api';
import { cleanUnderlying } from './api';

const POS = '#22c55e';
const NEG = '#ef4444';

function fmtMoney(n: number | null): string {
  if (n === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// Compact money for the big summary stats so large books fit a stat card (e.g. $1.2M, -$3.4K) —
// full precision is still shown in the per-position rows.
function fmtMoneyCompact(n: number | null): string {
  if (n === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtExpiry(exp: string | null): string {
  if (!exp) return '';
  const y = exp.slice(0, 4), m = exp.slice(4, 6), d = exp.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T12:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function pnlColor(pnl: number | null): string {
  if (pnl === null) return 'var(--t2)';
  return pnl >= 0 ? POS : NEG;
}

// ── aggregation ───────────────────────────────────────────────

interface PortfolioGroup {
  underlying:     string;
  positions:      UserPosition[];
  netPnl:         number;
  marketValue:    number;   // Σ mark · |qty| · multiplier
  costBasis:      number;
  sharesValue:    number;   // market value of stock legs
  optionsValue:   number;   // market value of option legs
  optionsRisk:    number;   // capital at risk in options (premium / cost basis)
  optionCount:    number;
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
  return positionMarketValue(p) - (p.unrealized_pnl ?? 0);
}

// Short composition label shown under the ticker (mirrors the Trades sub-label).
function composition(g: PortfolioGroup): string {
  if (g.hasStock && g.optionCount) return `Shares + ${g.optionCount} option${g.optionCount > 1 ? 's' : ''}`;
  if (g.optionCount) return `${g.optionCount} option${g.optionCount > 1 ? 's' : ''}`;
  return 'Shares';
}

// ── leg row (expanded) ────────────────────────────────────────

function LegRow({ pos, showPnl }: { pos: UserPosition; showPnl: boolean }) {
  const isOpt = pos.asset_class === 'OPT';
  const qty = pos.quantity ?? 0;
  const label = isOpt
    ? `${Math.abs(qty)}× $${pos.strike}${pos.put_call} ${fmtExpiry(pos.expiry)}`
    : `${Math.abs(qty).toLocaleString()} share${Math.abs(qty) !== 1 ? 's' : ''} @ ${pos.avg_cost != null ? `$${pos.avg_cost.toFixed(2)}` : '—'}`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 14px 7px 40px',
      borderBottom: '1px solid var(--bsub)', background: 'var(--bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, flexShrink: 0,
          color: isOpt ? 'var(--c4)' : 'var(--t2)',
          background: isOpt ? 'var(--c4bg)' : 'var(--s2)',
          border: isOpt ? '1px solid var(--c4b)' : '1px solid var(--border)',
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

// Per-position detail revealed on expand: Shares : Options allocation + (for options) the
// capital at risk and its portfolio impact. Same framing as the summary, scoped to one name.
function PositionMetrics({ group, portfolioValue, showPnl }: { group: PortfolioGroup; portfolioValue: number; showPnl: boolean }) {
  const splitTotal = group.sharesValue + group.optionsValue;
  const sharesPct = splitTotal > 0 ? Math.round((group.sharesValue / splitTotal) * 100) : null;
  const optionsPct = sharesPct !== null ? 100 - sharesPct : null;
  const hasBoth = group.hasStock && group.hasOption;
  const impactPct = portfolioValue > 0 ? (group.optionsRisk / portfolioValue) * 100 : null;
  const showRisk = group.hasOption && showPnl;
  if (!hasBoth && !showRisk) return null;

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '3px 16px',
      padding: '8px 14px 8px 40px', background: 'var(--bg)',
      borderBottom: '1px solid var(--bsub)', fontSize: 11, color: 'var(--t3)',
    }}>
      {hasBoth && (
        <span>Shares : Options{' '}
          <strong style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{sharesPct} : {optionsPct}</strong>
        </span>
      )}
      {showRisk && (
        <span>Options risk{' '}
          <strong style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(group.optionsRisk)}</strong>
          {impactPct !== null && (<> · <strong style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{impactPct.toFixed(1)}%</strong> of portfolio</>)}
        </span>
      )}
    </div>
  );
}

// ── position row (HoldingRow chrome: accent bar + ticker/sub-label + right P&L) ──

function GroupRow({ group, portfolioValue, isExpanded, onToggle, onSelectTicker, showPnl }: {
  group: PortfolioGroup;
  portfolioValue: number;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectTicker: (ticker: string) => void;
  showPnl: boolean;
}) {
  const { underlying, netPnl, marketValue, isStwPick, stwConviction } = group;
  const accent = stwConviction !== null ? (TIERS[stwConviction]?.color ?? 'var(--border)') : 'var(--border)';

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          borderBottom: '1px solid var(--bsub)', cursor: 'pointer',
          background: isExpanded ? 'var(--c5bg)' : 'transparent',
        }}
        onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
        onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* expand chevron */}
        <span style={{
          fontSize: 9, color: 'var(--t3)', flexShrink: 0, width: 8, textAlign: 'center',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s',
          display: 'inline-block',
        }}>▶</span>

        {/* conviction accent bar */}
        <div style={{ width: 3, height: 30, borderRadius: 2, flexShrink: 0, background: accent }} />

        {/* ticker + composition */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
            {isStwPick ? (
              <span onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
                <TickerLink ticker={underlying} onSelect={onSelectTicker} style={{ fontSize: 13, fontWeight: 700 }} />
              </span>
            ) : (
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>{underlying}</span>
            )}
            {stwConviction !== null && <ConvictionBadge level={stwConviction} />}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {composition(group)}
          </div>
        </div>

        {/* right: P&L + market value */}
        {showPnl && (
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
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

      {isExpanded && (
        <>
          <PositionMetrics group={group} portfolioValue={portfolioValue} showPnl={showPnl} />
          {group.positions.map((p) => <LegRow key={p.id} pos={p} showPnl={showPnl} />)}
        </>
      )}
    </>
  );
}

// ── summary stat card (Portfolio Overview chrome) ─────────────

function StatCard({ label, value, color, children }: { label: string; value?: string; color?: string; children?: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 104, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
      {children ?? (
        <div style={{ fontSize: 26, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      )}
      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function PortfolioSummary({ groups, showPnl }: { groups: PortfolioGroup[]; showPnl: boolean }) {
  const t = useMemo(() => {
    let marketValue = 0, pnl = 0, costBasis = 0, legs = 0, sharesMV = 0, optionsMV = 0, optionsRisk = 0, stwPicks = 0, lowConviction = 0;
    for (const g of groups) {
      marketValue += g.marketValue; pnl += g.netPnl; costBasis += g.costBasis; legs += g.positions.length;
      sharesMV += g.sharesValue; optionsMV += g.optionsValue; optionsRisk += g.optionsRisk;
      if (g.isStwPick) {
        stwPicks += 1;
        if (g.stwConviction === 1 || g.stwConviction === 2) lowConviction += 1;
      }
    }
    const split = sharesMV + optionsMV;
    const sharesPct = split > 0 ? Math.round((sharesMV / split) * 100) : null;
    return {
      marketValue, pnl, legs, optionsRisk, stwPicks, lowConviction,
      pnlPct: costBasis > 0 ? (pnl / costBasis) * 100 : null,
      sharesPct, optionsPct: sharesPct !== null ? 100 - sharesPct : null,
      riskPct: marketValue > 0 ? (optionsRisk / marketValue) * 100 : null,
    };
  }, [groups]);

  const positionCount = groups.length;

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {showPnl && <StatCard label="Market Value" value={fmtMoneyCompact(t.marketValue)} />}
        {showPnl && (
          <StatCard
            label={t.pnlPct !== null ? `${fmtPct(t.pnlPct)} return` : 'Unrealized P&L'}
            value={fmtMoneyCompact(t.pnl)}
            color={pnlColor(t.pnl)}
          />
        )}
        <StatCard label={`${t.legs} leg${t.legs === 1 ? '' : 's'}`} value={String(positionCount)} />

        {/* Shares : Options ratio (by market value) — mirrors the Overview's Equity : Options card */}
        <StatCard label="Shares : Options">
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', lineHeight: 1 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{t.sharesPct ?? '—'}</span>
            <span style={{ fontSize: 16, color: 'var(--t3)', marginBottom: 1 }}>:</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{t.optionsPct ?? '—'}</span>
          </div>
        </StatCard>

        {/* Options at risk ($) + its potential portfolio impact (% of book) */}
        {showPnl && (
          <StatCard
            label={t.riskPct !== null ? `${t.riskPct.toFixed(1)}% of portfolio` : 'Options at risk'}
            value={fmtMoneyCompact(t.optionsRisk)}
          />
        )}
      </div>

      {/* STW-overlap callout */}
      {positionCount > 0 && (
        <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span><strong style={{ color: 'var(--text)' }}>{t.stwPicks}</strong> of {positionCount} {positionCount === 1 ? 'position is' : 'positions are'} an STW pick</span>
          {t.lowConviction > 0 && (
            <span style={{ color: 'var(--c1)' }}>· ⚠ {t.lowConviction} with low / declining conviction</span>
          )}
        </div>
      )}
    </>
  );
}

// ── reusable surfaces ─────────────────────────────────────────

function InfoCard({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '24px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: action ? 12 : 6 }}>{title}</div>
      {body && <div style={{ fontSize: 12, color: 'var(--t3)' }}>{body}</div>}
      {action}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────

export function PortfolioPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: positions = [], isLoading: posLoading } = useUserPositions();
  const { data: settings } = useIbkrSettings();
  const { data: stwHoldings = [] } = useHoldings();
  const { sync, isSyncing, syncError, lastResult } = useSyncPortfolio();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showPnl, setShowPnl] = useState(true);
  const [filters, setFilters] = useState<PortfolioFilters>(DEFAULT_PORTFOLIO_FILTERS);

  const isConnected = !!(settings?.ibkr_flex_token && settings?.ibkr_query_id);

  const stwMap = useMemo(
    () => new Map(stwHoldings.map((h) => [h.ticker, h.conviction])),
    [stwHoldings],
  );

  const allGroups = useMemo<PortfolioGroup[]>(() => {
    const map = new Map<string, UserPosition[]>();
    for (const p of positions) {
      const key = cleanUnderlying(p.underlying);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).map(([underlying, legs]) => {
      const optionLegs = legs.filter((p) => p.asset_class === 'OPT');
      const stockLegs = legs.filter((p) => p.asset_class !== 'OPT');
      return {
        underlying,
        positions: legs,
        netPnl: legs.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0),
        marketValue: legs.reduce((s, p) => s + positionMarketValue(p), 0),
        costBasis: legs.reduce((s, p) => s + positionCostBasis(p), 0),
        sharesValue: stockLegs.reduce((s, p) => s + positionMarketValue(p), 0),
        optionsValue: optionLegs.reduce((s, p) => s + positionMarketValue(p), 0),
        optionsRisk: optionLegs.reduce((s, p) => s + positionCostBasis(p), 0),
        optionCount: optionLegs.length,
        isStwPick: stwMap.has(underlying),
        stwConviction: stwMap.has(underlying) ? (stwMap.get(underlying) ?? null) : null,
        hasStock: stockLegs.length > 0,
        hasOption: optionLegs.length > 0,
      };
    });
  }, [positions, stwMap]);

  const portfolioValue = useMemo(() => allGroups.reduce((s, g) => s + g.marketValue, 0), [allGroups]);

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
        case 'pnl_desc': case 'pnl_asc': return (a.netPnl - b.netPnl) * dir;
        case 'value_desc': case 'value_asc': return (a.marketValue - b.marketValue) * dir;
        case 'az': return a.underlying.localeCompare(b.underlying);
        case 'za': return b.underlying.localeCompare(a.underlying);
        default: return 0;
      }
    });
  }, [allGroups, filters]);

  const lastSynced = useMemo(() => {
    if (lastResult) return lastResult.lastSyncedAt;
    if (positions.length === 0) return null;
    return positions.reduce((max, p) => (p.last_synced_at > max ? p.last_synced_at : max), positions[0].last_synced_at);
  }, [positions, lastResult]);

  function toggleGroup(underlying: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(underlying)) next.delete(underlying); else next.add(underlying);
      return next;
    });
  }

  const onSelectTicker = (ticker: string) => navigate(`/picks?ticker=${encodeURIComponent(ticker)}`);

  const hasPositions = allGroups.length > 0;
  const pad = isMobile ? '14px 12px' : '20px 24px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Control bar — full bleed, matching the sub-tab/filter chrome */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>
          {lastSynced ? `Last synced: ${fmtDateTime(lastSynced)}` : 'Not synced yet'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowPnl((v) => !v)}
            title={showPnl ? 'Hide P&L' : 'Show P&L'}
            style={{
              width: 34, height: 34, borderRadius: 6, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: '1px solid var(--border)', color: showPnl ? 'var(--t2)' : 'var(--t3)', cursor: 'pointer', flexShrink: 0,
            }}
          >
            {showPnl ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            )}
          </button>
          <button
            onClick={sync}
            disabled={isSyncing || !isConnected}
            style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: isConnected ? 'var(--acc)' : 'var(--s2)', color: isConnected ? '#fff' : 'var(--t3)',
              border: 'none', cursor: isConnected ? 'pointer' : 'default', opacity: isSyncing ? 0.6 : 1, transition: 'opacity 0.15s',
            }}
          >
            {isSyncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Filter bar — only when there are positions to filter */}
      {isConnected && hasPositions && (
        <PortfolioFilterBar filters={filters} onChange={setFilters} filtered={visibleGroups.length} total={allGroups.length} />
      )}

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad }}>
        {syncError && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#2d0c0c', border: '1px solid var(--c1b)', color: 'var(--c1)', fontSize: 12 }}>
            {syncError}
          </div>
        )}

        {!isConnected ? (
          <InfoCard
            title="Connect your IBKR account to see your positions here."
            body=""
            action={
              <button
                onClick={() => navigate('/settings')}
                style={{ marginTop: 12, padding: '8px 18px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'var(--acc)', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Go to Settings →
              </button>
            }
          />
        ) : posLoading ? (
          <LoadingSpinner className="mt-16" />
        ) : !hasPositions ? (
          <InfoCard title="No positions loaded yet." body="Click Sync to fetch your current IBKR positions." />
        ) : (
          <>
            <div style={{ marginBottom: 18 }}>
              <PortfolioSummary groups={allGroups} showPnl={showPnl} />
            </div>

            {/* Positions card — same chrome as the Trades blotter */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
              <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>📊 Positions</span>
                <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>{visibleGroups.length}</span>
              </div>

              {visibleGroups.length === 0 ? (
                <p style={{ fontSize: 11, color: 'var(--t3)', padding: '12px 13px' }}>No positions match your filters.</p>
              ) : (
                visibleGroups.map((g) => (
                  <GroupRow
                    key={g.underlying}
                    group={g}
                    portfolioValue={portfolioValue}
                    isExpanded={expanded.has(g.underlying)}
                    onToggle={() => toggleGroup(g.underlying)}
                    onSelectTicker={onSelectTicker}
                    showPnl={showPnl}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
