import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIERS, fmtDateTime } from '@stw/shared';
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

// Traders the user follows. Only STW is wired today (the one trader with picks in the DB);
// the matching + summary are structured so more can be added without reworking the UI.
const FOLLOWED_TRADERS = ['STW'];

const POS = '#22c55e';
const NEG = '#ef4444';

// desktop grouped-view column widths — shared by the column header + rows so they line up
const COL = { ret: 58, pnl: 80, val: 92 };

// flat-table cell styles — copied from the Trades blotter so the two tables read identically
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', background: 'var(--s2)', padding: '7px 13px', borderBottom: '1px solid var(--bsub)', whiteSpace: 'nowrap' };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '9px 13px', borderBottom: '1px solid var(--bsub)', verticalAlign: 'middle', lineHeight: 1.4, whiteSpace: 'nowrap' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

function fmtMoney(n: number | null): string {
  if (n === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtMoneyCompact(n: number | null): string {
  if (n === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function fmtPrice(n: number | null): string {
  return n != null ? `$${n.toFixed(2)}` : '—';
}
function fmtExpiry(exp: string | null): string {
  if (!exp) return '';
  const y = exp.slice(0, 4), m = exp.slice(4, 6), d = exp.slice(6, 8);
  return new Date(`${y}-${m}-${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}
function pnlColor(pnl: number | null): string {
  if (pnl === null) return 'var(--t2)';
  return pnl >= 0 ? POS : NEG;
}

const posMV = (p: UserPosition) => (p.mark_price ?? 0) * Math.abs(p.quantity ?? 0) * p.multiplier;
const posCost = (p: UserPosition) => (p.avg_cost != null ? p.avg_cost * Math.abs(p.quantity ?? 0) * p.multiplier : posMV(p) - (p.unrealized_pnl ?? 0));

// "Common" (stock) or "$35C Sep '26" (option) — the per-leg instrument label, mirroring Trades.
function instrumentLabel(p: UserPosition): string {
  if (p.asset_class !== 'OPT') return 'Common';
  return `$${p.strike}${p.put_call} ${fmtExpiry(p.expiry)}`;
}

// ── aggregation (grouped view) ────────────────────────────────

interface PortfolioGroup {
  underlying:    string;
  positions:     UserPosition[];
  netPnl:        number;
  returnPct:     number | null;
  marketValue:   number;
  costBasis:     number;
  sharesValue:   number;
  optionsValue:  number;
  optionsRisk:   number;
  optionCount:   number;
  isTailed:      boolean;
  traders:       string[];
  conviction:    number | null;
  basket:        string;
  hasStock:      boolean;
  hasOption:     boolean;
}

function composition(g: PortfolioGroup): string {
  if (g.hasStock && g.optionCount) return `Shares + ${g.optionCount} option${g.optionCount > 1 ? 's' : ''}`;
  if (g.optionCount) return `${g.optionCount} option${g.optionCount > 1 ? 's' : ''}`;
  return 'Shares';
}

// trader badge shown next to a tailed ticker
function TraderBadge({ trader }: { trader: string }) {
  return <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, color: 'var(--acc)', background: 'var(--c5bg)', border: '1px solid var(--c5b)', flexShrink: 0 }}>{trader}</span>;
}

// ── flat table (default view) ─────────────────────────────────

interface LegRowData {
  p: UserPosition;
  underlying: string;
  isTailed: boolean;
  traders: string[];
  conviction: number | null;
}

function FlatLegRow({ row, onSelectTicker, showPnl, isMobile }: { row: LegRowData; onSelectTicker: (t: string) => void; showPnl: boolean; isMobile: boolean }) {
  const { p, underlying, isTailed, traders } = row;
  const qty = p.quantity ?? 0;
  const direction = qty < 0 ? 'Short' : 'Long';
  return (
    <tr>
      <td style={td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isTailed
            ? <TickerLink ticker={underlying} onSelect={onSelectTicker} />
            : <span style={{ fontWeight: 600, color: 'var(--text)' }}>{underlying}</span>}
          {isTailed && traders.map((t) => <TraderBadge key={t} trader={t} />)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{instrumentLabel(p)}</div>
      </td>
      {!isMobile && <td style={{ ...td, color: 'var(--t2)' }}>{direction}</td>}
      {!isMobile && showPnl && <td style={{ ...tdR, color: 'var(--t2)' }}>{fmtPrice(p.avg_cost)}</td>}
      {!isMobile && showPnl && <td style={{ ...tdR, color: 'var(--t2)' }}>{fmtPrice(p.mark_price)}</td>}
      {!isMobile && showPnl && <td style={{ ...tdR, color: 'var(--t2)' }}>{fmtMoney(posMV(p))}</td>}
      {showPnl && <td style={{ ...tdR, color: pnlColor(p.unrealized_pnl_pct), fontWeight: 600 }}>{fmtPct(p.unrealized_pnl_pct)}</td>}
      {showPnl && <td style={{ ...tdR, color: pnlColor(p.unrealized_pnl), fontWeight: 600 }}>{fmtMoney(p.unrealized_pnl)}</td>}
    </tr>
  );
}

function FlatTable({ rows, onSelectTicker, showPnl, isMobile }: { rows: LegRowData[]; onSelectTicker: (t: string) => void; showPnl: boolean; isMobile: boolean }) {
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 9 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={th}>Ticker</th>
            {!isMobile && <th style={th}>Type</th>}
            {!isMobile && showPnl && <th style={thR}>Avg Cost</th>}
            {!isMobile && showPnl && <th style={thR}>Mark</th>}
            {!isMobile && showPnl && <th style={thR}>Value</th>}
            {showPnl && <th style={thR}>Return</th>}
            {showPnl && <th style={thR}>P&L</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <FlatLegRow key={r.p.id} row={r} onSelectTicker={onSelectTicker} showPnl={showPnl} isMobile={isMobile} />)}
        </tbody>
      </table>
    </div>
  );
}

// ── grouped view (accordion, on "Group by ticker") ────────────

function LegRow({ pos, showPnl }: { pos: UserPosition; showPnl: boolean }) {
  const isOpt = pos.asset_class === 'OPT';
  const qty = pos.quantity ?? 0;
  const label = isOpt
    ? `${Math.abs(qty)}× $${pos.strike}${pos.put_call} ${fmtExpiry(pos.expiry)}`
    : `${Math.abs(qty).toLocaleString()} share${Math.abs(qty) !== 1 ? 's' : ''} @ ${pos.avg_cost != null ? `$${pos.avg_cost.toFixed(2)}` : '—'}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px 7px 40px', borderBottom: '1px solid var(--bsub)', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, flexShrink: 0,
          color: isOpt ? 'var(--c4)' : 'var(--t2)', background: isOpt ? 'var(--c4bg)' : 'var(--s2)',
          border: isOpt ? '1px solid var(--c4b)' : '1px solid var(--border)',
        }}>
          {isOpt ? `${qty < 0 ? 'SHORT ' : ''}${pos.put_call === 'C' ? 'CALL' : 'PUT'}` : 'STOCK'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      {showPnl && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {pos.unrealized_pnl_pct !== null && <div style={{ fontSize: 12, fontWeight: 600, color: pnlColor(pos.unrealized_pnl_pct), fontVariantNumeric: 'tabular-nums' }}>{fmtPct(pos.unrealized_pnl_pct)}</div>}
          {pos.unrealized_pnl !== null && <div style={{ fontSize: 10, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(pos.unrealized_pnl)}</div>}
        </div>
      )}
    </div>
  );
}

function PositionMetrics({ group, portfolioValue, showPnl }: { group: PortfolioGroup; portfolioValue: number; showPnl: boolean }) {
  const split = group.sharesValue + group.optionsValue;
  const sharesPct = split > 0 ? Math.round((group.sharesValue / split) * 100) : null;
  const optionsPct = sharesPct !== null ? 100 - sharesPct : null;
  const hasBoth = group.hasStock && group.hasOption;
  const impactPct = portfolioValue > 0 ? (group.optionsRisk / portfolioValue) * 100 : null;
  const showRisk = group.hasOption && showPnl;
  if (!hasBoth && !showRisk) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 16px', padding: '8px 14px 8px 40px', background: 'var(--bg)', borderBottom: '1px solid var(--bsub)', fontSize: 11, color: 'var(--t3)' }}>
      {hasBoth && <span>Shares : Options <strong style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{sharesPct} : {optionsPct}</strong></span>}
      {showRisk && (
        <span>Options risk <strong style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(group.optionsRisk)}</strong>
          {impactPct !== null && <> · <strong style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{impactPct.toFixed(1)}%</strong> of portfolio</>}
        </span>
      )}
    </div>
  );
}

function GroupRow({ group, portfolioValue, isExpanded, onToggle, onSelectTicker, showPnl, isMobile }: {
  group: PortfolioGroup; portfolioValue: number; isExpanded: boolean; onToggle: () => void;
  onSelectTicker: (t: string) => void; showPnl: boolean; isMobile: boolean;
}) {
  const { underlying, netPnl, returnPct, marketValue, isTailed, traders, conviction } = group;
  const accent = conviction !== null ? (TIERS[conviction]?.color ?? 'var(--border)') : 'var(--border)';
  return (
    <>
      <div
        role="button" tabIndex={0} onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--bsub)', cursor: 'pointer', background: isExpanded ? 'var(--c5bg)' : 'transparent' }}
        onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
        onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{ fontSize: 9, color: 'var(--t3)', flexShrink: 0, width: 8, textAlign: 'center', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
        <div style={{ width: 3, height: 30, borderRadius: 2, flexShrink: 0, background: accent }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
            {isTailed ? (
              <span onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
                <TickerLink ticker={underlying} onSelect={onSelectTicker} style={{ fontSize: 13, fontWeight: 700 }} />
              </span>
            ) : (
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>{underlying}</span>
            )}
            {isTailed && traders.map((t) => <TraderBadge key={t} trader={t} />)}
            {conviction !== null && <ConvictionBadge level={conviction} />}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{composition(group)}</div>
        </div>
        {showPnl && (isMobile ? (
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: pnlColor(netPnl), fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(netPnl)}</div>
            {marketValue > 0 && <div style={{ fontSize: 10, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(marketValue)} mkt</div>}
          </div>
        ) : (
          <>
            <div style={{ width: COL.ret, textAlign: 'right', flexShrink: 0, fontSize: 12, fontWeight: 600, color: pnlColor(returnPct), fontVariantNumeric: 'tabular-nums' }}>{returnPct !== null ? fmtPct(returnPct) : '—'}</div>
            <div style={{ width: COL.pnl, textAlign: 'right', flexShrink: 0, fontSize: 13, fontWeight: 600, color: pnlColor(netPnl), fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(netPnl)}</div>
            <div style={{ width: COL.val, textAlign: 'right', flexShrink: 0, fontSize: 12, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(marketValue)}</div>
          </>
        ))}
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

// ── summary stat cards ────────────────────────────────────────

function StatCard({ label, value, color, title, children }: { label: string; value?: string; color?: string; title?: string; children?: React.ReactNode }) {
  return (
    <div title={title} style={{ flex: 1, minWidth: 104, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
      {children ?? <div style={{ fontSize: 26, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>}
      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function PortfolioSummary({ groups, showPnl }: { groups: PortfolioGroup[]; showPnl: boolean }) {
  const t = useMemo(() => {
    let mv = 0, pnl = 0, cost = 0, legs = 0, sharesVal = 0, optVal = 0, optRisk = 0, tailed = 0, low = 0;
    const traderCount: Record<string, number> = {};
    for (const g of groups) {
      mv += g.marketValue; pnl += g.netPnl; cost += g.costBasis; legs += g.positions.length;
      sharesVal += g.sharesValue; optVal += g.optionsValue; optRisk += g.optionsRisk;
      if (g.isTailed) {
        tailed += 1;
        for (const tr of g.traders) traderCount[tr] = (traderCount[tr] ?? 0) + 1;
        if (g.conviction === 1 || g.conviction === 2) low += 1;
      }
    }
    const split = sharesVal + optVal;
    const equityPct = split > 0 ? Math.round((sharesVal / split) * 100) : null;
    return {
      mv, pnl, legs, optRisk, tailed, low, traderCount,
      retPct: cost > 0 ? (pnl / cost) * 100 : null,
      riskPct: mv > 0 ? (optRisk / mv) * 100 : null,
      equityPct, optionsPct: equityPct !== null ? 100 - equityPct : null,
    };
  }, [groups]);

  const positionCount = groups.length;
  const traderSummary = Object.entries(t.traderCount).map(([k, n]) => `${n} ${k}`).join(' · ');

  return (
    <>
      {/* Order: Legs · Market Value · Return · Equity:Options · Options at risk */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard label={`${t.legs} leg${t.legs === 1 ? '' : 's'}`} value={String(positionCount)} title="Open positions (grouped by underlying)" />
        {showPnl && <StatCard label="Market Value" value={fmtMoneyCompact(t.mv)} />}
        {showPnl && (
          <StatCard
            label={t.retPct !== null ? `${fmtPct(t.retPct)} · unrealized` : 'Unrealized P&L'}
            value={fmtMoneyCompact(t.pnl)}
            color={pnlColor(t.pnl)}
            title="Unrealized P&L on your currently-open positions (IBKR mark vs your average cost) — not a weekly/monthly figure."
          />
        )}
        <StatCard label="Equity : Options (by market value)" title="Share of current market value held as equity vs options — same basis as the Stock Picks Overview.">
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', lineHeight: 1 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{t.equityPct ?? '—'}</span>
            <span style={{ fontSize: 16, color: 'var(--t3)', marginBottom: 1 }}>:</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{t.optionsPct ?? '—'}</span>
          </div>
        </StatCard>
        {showPnl && (
          <StatCard
            label={t.riskPct !== null ? `${t.riskPct.toFixed(1)}% of book at risk` : 'Options'}
            value={fmtMoneyCompact(t.optRisk)}
            title="Option premium currently at risk (cost basis of your option legs) and what % of the book that represents — your max loss if the options expire worthless."
          />
        )}
      </div>

      {positionCount > 0 && (
        <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span><strong style={{ color: 'var(--text)' }}>{t.tailed}</strong> of {positionCount} {positionCount === 1 ? 'position' : 'positions'} {t.tailed === 1 ? 'matches' : 'match'} a tailed pick{traderSummary ? ` (${traderSummary})` : ''}</span>
          {t.low > 0 && <span style={{ color: 'var(--c1)' }}>· ⚠ {t.low} with low / declining conviction</span>}
        </div>
      )}
    </>
  );
}

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

  // ticker → followed-trader pick (conviction + basket). Single trader today; structured for more.
  const pickMap = useMemo(() => {
    const m = new Map<string, { conviction: number | null; basket: string; traders: string[] }>();
    for (const h of stwHoldings) {
      m.set(h.ticker, { conviction: h.conviction ?? null, basket: h.basket ?? '', traders: [FOLLOWED_TRADERS[0]] });
    }
    return m;
  }, [stwHoldings]);

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
      const pick = pickMap.get(underlying);
      const netPnl = legs.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0);
      const costBasis = legs.reduce((s, p) => s + posCost(p), 0);
      return {
        underlying, positions: legs, netPnl,
        returnPct: costBasis > 0 ? (netPnl / costBasis) * 100 : null,
        marketValue: legs.reduce((s, p) => s + posMV(p), 0),
        costBasis,
        sharesValue: stockLegs.reduce((s, p) => s + posMV(p), 0),
        optionsValue: optionLegs.reduce((s, p) => s + posMV(p), 0),
        optionsRisk: optionLegs.reduce((s, p) => s + posCost(p), 0),
        optionCount: optionLegs.length,
        isTailed: !!pick,
        traders: pick?.traders ?? [],
        conviction: pick?.conviction ?? null,
        basket: pick?.basket ?? '',
        hasStock: stockLegs.length > 0,
        hasOption: optionLegs.length > 0,
      };
    });
  }, [positions, pickMap]);

  const portfolioValue = useMemo(() => allGroups.reduce((s, g) => s + g.marketValue, 0), [allGroups]);
  const baskets = useMemo(
    () => [...new Set(allGroups.filter((g) => g.isTailed && g.basket).map((g) => g.basket))].sort(),
    [allGroups],
  );

  const matchFilters = (underlying: string, isTailed: boolean, basket: string, isOpt: boolean) => {
    const q = filters.search.trim().toUpperCase();
    if (filters.tailedOnly && !isTailed) return false;
    if (filters.type === 'stocks' && isOpt) return false;
    if (filters.type === 'options' && !isOpt) return false;
    if (filters.basket && basket !== filters.basket) return false;
    if (q && !underlying.toUpperCase().includes(q)) return false;
    return true;
  };
  const dir = filters.sort.endsWith('_asc') ? 1 : -1;
  const nl = (v: number | null) => (v == null ? Number.NEGATIVE_INFINITY : v);

  // grouped view rows
  const visibleGroups = useMemo<PortfolioGroup[]>(() => {
    const filtered = allGroups.filter((g) => matchFilters(g.underlying, g.isTailed, g.basket, g.hasOption && !g.hasStock));
    return [...filtered].sort((a, b) => {
      switch (filters.sort) {
        case 'pnl_desc': case 'pnl_asc': return (a.netPnl - b.netPnl) * dir;
        case 'ret_desc': case 'ret_asc': return (nl(a.returnPct) - nl(b.returnPct)) * dir;
        case 'value_desc': case 'value_asc': return (a.marketValue - b.marketValue) * dir;
        case 'az': return a.underlying.localeCompare(b.underlying);
        case 'za': return b.underlying.localeCompare(a.underlying);
        default: return 0;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups, filters]);

  // flat per-leg rows (default view)
  const visibleLegs = useMemo<LegRowData[]>(() => {
    const rows = positions.map((p) => {
      const underlying = cleanUnderlying(p.underlying);
      const pick = pickMap.get(underlying);
      return { p, underlying, isTailed: !!pick, traders: pick?.traders ?? [], conviction: pick?.conviction ?? null, basket: pick?.basket ?? '' };
    }).filter((r) => matchFilters(r.underlying, r.isTailed, r.basket, r.p.asset_class === 'OPT'));
    return rows.sort((a, b) => {
      switch (filters.sort) {
        case 'pnl_desc': case 'pnl_asc': return (nl(a.p.unrealized_pnl) - nl(b.p.unrealized_pnl)) * dir;
        case 'ret_desc': case 'ret_asc': return (nl(a.p.unrealized_pnl_pct) - nl(b.p.unrealized_pnl_pct)) * dir;
        case 'value_desc': case 'value_asc': return (posMV(a.p) - posMV(b.p)) * dir;
        case 'az': return a.underlying.localeCompare(b.underlying) || instrumentLabel(a.p).localeCompare(instrumentLabel(b.p));
        case 'za': return b.underlying.localeCompare(a.underlying) || instrumentLabel(a.p).localeCompare(instrumentLabel(b.p));
        default: return 0;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, pickMap, filters]);

  const lastSynced = useMemo(() => {
    if (lastResult) return lastResult.lastSyncedAt;
    if (positions.length === 0) return null;
    return positions.reduce((max, p) => (p.last_synced_at > max ? p.last_synced_at : max), positions[0].last_synced_at);
  }, [positions, lastResult]);

  function toggleGroup(u: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(u) ? n.delete(u) : n.add(u); return n; });
  }
  const onSelectTicker = (t: string) => navigate(`/picks?ticker=${encodeURIComponent(t)}`);

  const hasPositions = allGroups.length > 0;
  const grouped = filters.groupByTicker;
  const visibleCount = grouped ? visibleGroups.length : visibleLegs.length;
  const totalCount = grouped ? allGroups.length : positions.length;
  const pad = isMobile ? '14px 12px' : '20px 24px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Combined bar: filters scroll on the left; synced stamp (right-aligned) + eye + Sync pinned right */}
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', minWidth: 'max-content' }}>
            {isConnected && hasPositions && (
              <PortfolioFilterBar filters={filters} onChange={setFilters} baskets={baskets} filtered={visibleCount} total={totalCount} />
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderLeft: '1px solid var(--bsub)' }}>
          {!isMobile && lastSynced && (
            <span style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>Synced {fmtDateTime(lastSynced)}</span>
          )}
          {hasPositions && (
            <button onClick={() => setShowPnl((v) => !v)} title={showPnl ? 'Hide P&L' : 'Show P&L'}
              style={{ width: 34, height: 34, borderRadius: 6, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border)', color: showPnl ? 'var(--t2)' : 'var(--t3)', cursor: 'pointer', flexShrink: 0 }}>
              {showPnl ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              )}
            </button>
          )}
          <button onClick={sync} disabled={isSyncing || !isConnected}
            style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: isConnected ? 'var(--acc)' : 'var(--s2)', color: isConnected ? '#fff' : 'var(--t3)', border: 'none', cursor: isConnected ? 'pointer' : 'default', opacity: isSyncing ? 0.6 : 1, transition: 'opacity 0.15s', flexShrink: 0 }}>
            {isSyncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad }}>
        {syncError && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#2d0c0c', border: '1px solid var(--c1b)', color: 'var(--c1)', fontSize: 12 }}>{syncError}</div>}

        {!isConnected ? (
          <InfoCard title="Connect your IBKR account to see your positions here." body=""
            action={<button onClick={() => navigate('/settings')} style={{ marginTop: 12, padding: '8px 18px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'var(--acc)', color: '#fff', border: 'none', cursor: 'pointer' }}>Go to Settings →</button>} />
        ) : posLoading ? (
          <LoadingSpinner className="mt-16" />
        ) : !hasPositions ? (
          <InfoCard title="No positions loaded yet." body="Click Sync to fetch your current IBKR positions." />
        ) : (
          <>
            <div style={{ marginBottom: 18 }}><PortfolioSummary groups={allGroups} showPnl={showPnl} /></div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
              <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>📊 Positions</span>
                <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>{visibleCount}</span>
              </div>

              {visibleCount === 0 ? (
                <p style={{ fontSize: 11, color: 'var(--t3)', padding: '12px 13px' }}>No positions match your filters.</p>
              ) : grouped ? (
                <>
                  {!isMobile && showPnl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)' }}>
                      <span style={{ width: 8, flexShrink: 0 }} />
                      <span style={{ width: 3, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>Ticker</span>
                      <span style={{ width: COL.ret, textAlign: 'right', flexShrink: 0 }}>Return</span>
                      <span style={{ width: COL.pnl, textAlign: 'right', flexShrink: 0 }}>P&L</span>
                      <span style={{ width: COL.val, textAlign: 'right', flexShrink: 0 }}>Value</span>
                    </div>
                  )}
                  {visibleGroups.map((g) => (
                    <GroupRow key={g.underlying} group={g} portfolioValue={portfolioValue}
                      isExpanded={expanded.has(g.underlying)} onToggle={() => toggleGroup(g.underlying)}
                      onSelectTicker={onSelectTicker} showPnl={showPnl} isMobile={isMobile} />
                  ))}
                </>
              ) : (
                <FlatTable rows={visibleLegs} onSelectTicker={onSelectTicker} showPnl={showPnl} isMobile={isMobile} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
