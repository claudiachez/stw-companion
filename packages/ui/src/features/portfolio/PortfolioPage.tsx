import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TIERS, fmtDateTime, sizingTone, matchConvictionBand, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, SPACE } from '@stw/shared';
import { useUserPositions, useIbkrSettings } from './useUserPositions';
import { useSyncPortfolio } from './useSyncPortfolio';
import { useHoldings } from '../picks/useHoldings';
import { useConvictionChanges, type HoldingRef } from '../picks/useConvictionChanges';
import { ConvictionBadge } from '../picks/components/ConvictionBadge';
import { useTickerRegime, type TickerRegime } from '../picks/useTickerRegime';
import { RegimeBadge } from '../picks/components/RegimeBadge';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { TickerLink } from '../../primitives/TickerLink';
import { Badge } from '../../primitives/Badge';
import { Button } from '../../primitives/Button';
import { AlertStrip } from '../../primitives/AlertStrip';
import { KpiCard, type KpiStatus } from '../../primitives/KpiCard';
import { PortfolioHeatmap, type HeatmapCell } from '../../components/PortfolioHeatmap';
import { AccordionList } from '../../primitives/AccordionList';
import { SubNav } from '../../primitives/SubNav';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCapabilities } from '../../context/AppCapabilities';
import { ViolationsSummary } from '../limits/ViolationsSummary';
import { useBindingGrossTarget } from '../limits/useBindingGrossTarget';
import { useSectorMap, useRiskConfig } from '../limits/useRiskConfig';
import { DEFAULT_RISK_CONFIG } from '../limits/api';
import { RegimeLight } from '../regime/RegimeLight';
import { useRegimeInstrumentStore, REGIME_INSTRUMENTS } from '../regime/useRegimeInstrument';
import { useAuthStore } from '../../store/auth';
import { PortfolioPositionDetail, type DetailGroup } from './PortfolioPositionDetail';
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

// Secondary-nav tabs (§1) — splits the page's four jobs (health / browse / risk /
// tailing) so each stops fighting the others for one scroll.
type PortfolioTab = 'overview' | 'positions' | 'risk' | 'tailing';
const PORTFOLIO_TABS: { value: PortfolioTab; label: string }[] = [
  { value: 'overview',  label: 'Overview' },
  { value: 'positions', label: 'Positions' },
  { value: 'risk',      label: 'Risk' },
  { value: 'tailing',   label: 'Tailing' },
];

// desktop grouped-view column widths — shared by the column header + rows so they line up
const COL = { ret: 58, pnl: 80, val: 92 };

// flat-table cell styles — copied from the Trades blotter so the two tables read identically
const th: React.CSSProperties = { textAlign: 'left', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, color: 'var(--t3)', background: 'var(--s2)', padding: '7px 13px', borderBottom: '1px solid var(--bsub)', whiteSpace: 'nowrap' };
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
  return pnl >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)';
}
function pnlStatus(pnl: number | null): KpiStatus {
  if (pnl === null) return 'neutral';
  return pnl >= 0 ? 'positive' : 'negative';
}

const posMV = (p: UserPosition) => (p.mark_price ?? 0) * Math.abs(p.quantity ?? 0) * p.multiplier;
const posCost = (p: UserPosition) => (p.avg_cost != null ? p.avg_cost * Math.abs(p.quantity ?? 0) * p.multiplier : posMV(p) - (p.unrealized_pnl ?? 0));

// "Common" (stock) or "$35C Sep '26" (option) — the per-leg instrument label, mirroring Trades.
function instrumentLabel(p: UserPosition): string {
  if (p.asset_class !== 'OPT') return 'Common';
  return `$${p.strike}${p.put_call} ${fmtExpiry(p.expiry)}`;
}

// §6.4 — instrument kind, not direction. "Long" was near-zero info in a long-only book;
// Shares / Call / Put actually distinguishes the legs (a short leg keeps its Short prefix).
function typeLabel(p: UserPosition): string {
  if (p.asset_class !== 'OPT') return 'Shares';
  const kind = p.put_call === 'C' ? 'Call' : p.put_call === 'P' ? 'Put' : 'Option';
  return (p.quantity ?? 0) < 0 ? `Short ${kind}` : kind;
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

// ── flat table (default view) ─────────────────────────────────

interface LegRowData {
  p: UserPosition;
  underlying: string;
  isTailed: boolean;
  traders: string[];
  conviction: number | null;
}

function FlatLegRow({ row, onSelectTicker, showPnl, isMobile, portfolioValue, regime }: { row: LegRowData; onSelectTicker: (t: string) => void; showPnl: boolean; isMobile: boolean; portfolioValue: number; regime?: TickerRegime }) {
  const { p, underlying, isTailed, traders } = row;
  const weightPct = portfolioValue > 0 ? (posMV(p) / portfolioValue) * 100 : null;
  return (
    <tr>
      <td style={td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Every position opens its own detail pane, tailed or not (host, 2026-07-08). */}
          <TickerLink ticker={underlying} onSelect={onSelectTicker} />
          {isTailed && traders.map((t) => <Badge key={t} kind="source" trader={t} />)}
          {/* Compact = trend-structure chip only (matches the Stock Picks list rows). */}
          <RegimeBadge regime={regime} compact />
        </div>
        <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 1 }}>{instrumentLabel(p)}</div>
      </td>
      {!isMobile && <td style={{ ...td, color: 'var(--t2)' }}>{typeLabel(p)}</td>}
      {!isMobile && showPnl && <td style={{ ...tdR, color: 'var(--t2)' }}>{fmtPrice(p.avg_cost)}</td>}
      {!isMobile && showPnl && <td style={{ ...tdR, color: 'var(--t2)' }}>{fmtPrice(p.mark_price)}</td>}
      {!isMobile && showPnl && <td style={{ ...tdR, color: 'var(--t2)' }}>{fmtMoney(posMV(p))}</td>}
      <td style={{ ...tdR, color: 'var(--t2)' }}>{weightPct !== null ? `${weightPct.toFixed(1)}%` : '—'}</td>
      {showPnl && <td style={{ ...tdR, color: pnlColor(p.unrealized_pnl), fontWeight: 600 }}>{fmtMoney(p.unrealized_pnl)}</td>}
    </tr>
  );
}

function FlatTable({ rows, onSelectTicker, showPnl, isMobile, portfolioValue, regimes }: { rows: LegRowData[]; onSelectTicker: (t: string) => void; showPnl: boolean; isMobile: boolean; portfolioValue: number; regimes: Record<string, TickerRegime> }) {
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 9 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT_SIZE.xs }}>
        <thead>
          <tr>
            <th style={th}>Ticker</th>
            {!isMobile && <th style={th}>Type</th>}
            {!isMobile && showPnl && <th style={thR}>Avg Cost</th>}
            {!isMobile && showPnl && <th style={thR}>Mark</th>}
            {!isMobile && showPnl && <th style={thR}>Value</th>}
            <th style={thR} title="Position market value as a % of your whole book — the figure the limits engine judges you on">Weight</th>
            {showPnl && <th style={thR}>P&L</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <FlatLegRow key={r.p.id} row={r} onSelectTicker={onSelectTicker} showPnl={showPnl} isMobile={isMobile} portfolioValue={portfolioValue} regime={regimes[r.underlying]} />)}
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
          fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, padding: '1px 5px', borderRadius: 4, flexShrink: 0,
          color: isOpt ? 'var(--c4)' : 'var(--t2)', background: isOpt ? 'var(--c4bg)' : 'var(--s2)',
          border: isOpt ? '1px solid var(--c4b)' : '1px solid var(--border)',
        }}>
          {isOpt ? `${qty < 0 ? 'SHORT ' : ''}${pos.put_call === 'C' ? 'CALL' : 'PUT'}` : 'STOCK'}
        </span>
        <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      {showPnl && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {pos.unrealized_pnl_pct !== null && <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: pnlColor(pos.unrealized_pnl_pct), fontVariantNumeric: 'tabular-nums' }}>{fmtPct(pos.unrealized_pnl_pct)}</div>}
          {pos.unrealized_pnl !== null && <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(pos.unrealized_pnl)}</div>}
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 16px', padding: '8px 14px 8px 40px', background: 'var(--bg)', borderBottom: '1px solid var(--bsub)', fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>
      {hasBoth && <span>Shares : Options <strong style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{sharesPct} : {optionsPct}</strong></span>}
      {showRisk && (
        <span>Options risk <strong style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(group.optionsRisk)}</strong>
          {impactPct !== null && <> · <strong style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{impactPct.toFixed(1)}%</strong> of portfolio</>}
        </span>
      )}
    </div>
  );
}

// header content for a group's accordion row (ticker/badges/composition + P&L columns) —
// the AccordionList call site below supplies this as `renderHeader`.
function GroupHeader({ group, onSelectTicker, showPnl, isMobile, portfolioValue, regime }: {
  group: PortfolioGroup; onSelectTicker: (t: string) => void; showPnl: boolean; isMobile: boolean; portfolioValue: number; regime?: TickerRegime;
}) {
  const { underlying, netPnl, marketValue, isTailed, traders, conviction } = group;
  const weightPct = portfolioValue > 0 ? (marketValue / portfolioValue) * 100 : null;
  return (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
          {/* Every position's ticker links to its own detail pane, tailed or not. */}
          <span onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
            <TickerLink ticker={underlying} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold }} />
          </span>
          {isTailed && traders.map((t) => <Badge key={t} kind="source" trader={t} />)}
          {conviction !== null && <ConvictionBadge level={conviction} />}
          {/* Compact = trend-structure chip only (matches the Stock Picks list rows). */}
          <RegimeBadge regime={regime} compact />
        </div>
        <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{composition(group)}</div>
      </div>
      {showPnl && (isMobile ? (
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: pnlColor(netPnl), fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(netPnl)}</div>
          {marketValue > 0 && <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(marketValue)} mkt</div>}
        </div>
      ) : (
        <>
          <div style={{ width: COL.ret, textAlign: 'right', flexShrink: 0, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{weightPct !== null ? `${weightPct.toFixed(1)}%` : '—'}</div>
          <div style={{ width: COL.pnl, textAlign: 'right', flexShrink: 0, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: pnlColor(netPnl), fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(netPnl)}</div>
          <div style={{ width: COL.val, textAlign: 'right', flexShrink: 0, fontSize: FONT_SIZE.sm, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(marketValue)}</div>
        </>
      ))}
    </>
  );
}

// ── summary stat cards ────────────────────────────────────────

// §2.3 — a clickable pill for the two Overview alerts, each jumping to the
// relevant filtered view. Two severities: neutral info vs amber warning.
function SummaryChip({ severity, onClick, children }: { severity: 'info' | 'warning'; onClick: () => void; children: React.ReactNode }) {
  const c = severity === 'warning'
    ? { fg: 'var(--status-warning-text)', bg: 'var(--status-warning-bg)', bd: 'var(--status-warning-border)' }
    : { fg: 'var(--t2)', bg: 'var(--s2)', bd: 'var(--border)' };
  return (
    <button
      onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: FONT_SIZE.xs, color: c.fg, background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }}
    >
      {children}
      <span style={{ opacity: 0.55 }}>→</span>
    </button>
  );
}

function PortfolioSummary({ groups, showPnl, onOpenTailing, onOpenLowConviction }: {
  groups: PortfolioGroup[]; showPnl: boolean;
  onOpenTailing: () => void;
  onOpenLowConviction: () => void;
}) {
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
      {/* Regime read lives on the Risk tab (RegimeLight) — removed from Overview
          (host 2026-07-11) to keep the header to the KPI row. */}

      {/* Every card reads the same: hero number · qualifier (delta) · uppercase label. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 104 }} title="Open positions, grouped by underlying">
          <KpiCard label="Positions" primaryValue={positionCount} delta={{ value: `${t.legs} leg${t.legs === 1 ? '' : 's'}`, direction: 'flat' }} />
        </div>
        {showPnl && (
          <div style={{ flex: 1, minWidth: 104 }} title="Total market value of your open positions">
            <KpiCard label="Market Value" primaryValue={fmtMoneyCompact(t.mv)} />
          </div>
        )}
        {showPnl && (
          <div
            style={{ flex: 1, minWidth: 104 }}
            title="Unrealized P&L on your currently-open positions (IBKR mark vs your average cost) — not a weekly/monthly figure."
          >
            <KpiCard
              label="Unrealized P&L"
              primaryValue={fmtMoneyCompact(t.pnl)}
              status={pnlStatus(t.pnl)}
              delta={t.retPct !== null ? { value: `${fmtPct(t.retPct)} unrealized`, direction: t.pnl >= 0 ? 'up' : 'down' } : undefined}
            />
          </div>
        )}
        <div
          style={{ flex: 1, minWidth: 104 }}
          title="Share of current market value held as equity vs options — same basis as the Stock Picks Overview."
        >
          <KpiCard
            label="Equity / Options (mkt value)"
            primaryValue={t.equityPct !== null ? `${t.equityPct}%` : '—'}
            secondaryValue={t.optionsPct !== null ? `/ ${t.optionsPct}%` : undefined}
          />
        </div>
        {showPnl && (
          <div
            style={{ flex: 1, minWidth: 104 }}
            title="Option premium at risk = the cost basis of your option legs (your max loss if they expire worthless), and what % of the book that represents."
          >
            <KpiCard
              label="Options at risk"
              primaryValue={fmtMoneyCompact(t.optRisk)}
              delta={t.riskPct !== null ? { value: `${t.riskPct.toFixed(1)}% of book`, direction: 'flat' } : undefined}
            />
          </div>
        )}
      </div>

      {positionCount > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <SummaryChip severity="info" onClick={onOpenTailing}>
            <span><strong style={{ color: 'var(--text)' }}>{t.tailed}</strong> of {positionCount} tailed{traderSummary ? ` · ${traderSummary}` : ''}</span>
          </SummaryChip>
          {t.low > 0 && (
            <SummaryChip severity="warning" onClick={onOpenLowConviction}>
              <span>⚠ {t.low} with low / declining conviction</span>
            </SummaryChip>
          )}
        </div>
      )}
    </>
  );
}

// §1 Overview — biggest ± positions by unrealized P&L $ (return % isn't populated
// in the subscriber Flex feed, so $ is the only reliable mover metric). Click → open
// that position's detail on the Positions tab.
function TopMovers({ groups, onOpenPosition }: { groups: PortfolioGroup[]; onOpenPosition: (t: string) => void }) {
  const withPnl = groups.filter((g) => g.netPnl !== 0);
  const gainers = [...withPnl].filter((g) => g.netPnl > 0).sort((a, b) => b.netPnl - a.netPnl).slice(0, 3);
  const losers = [...withPnl].filter((g) => g.netPnl < 0).sort((a, b) => a.netPnl - b.netPnl).slice(0, 3);
  if (gainers.length === 0 && losers.length === 0) return null;

  const col = (title: string, rows: PortfolioGroup[]) => (
    <div style={{ flex: 1, minWidth: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, color: 'var(--t3)' }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ padding: '10px 13px', fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>None</div>
      ) : rows.map((g) => (
        <button key={g.underlying} onClick={() => onOpenPosition(g.underlying)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 13px', borderBottom: '1px solid var(--bsub)', background: 'none', border: 'none', cursor: 'pointer', fontSize: FONT_SIZE.sm }}>
          <span style={{ fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)' }}>{g.underlying}</span>
          <span style={{ color: pnlColor(g.netPnl), fontVariantNumeric: 'tabular-nums', fontWeight: FONT_WEIGHT.semibold }}>{fmtMoney(g.netPnl)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, color: 'var(--t3)', marginBottom: 8 }}>Top movers</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {col('Gainers', gainers)}
        {col('Losers', losers)}
      </div>
    </div>
  );
}

function InfoCard({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '24px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', textAlign: 'center' }}>
      <div style={{ fontSize: FONT_SIZE.base, color: 'var(--t2)', marginBottom: action ? 12 : 6 }}>{title}</div>
      {body && <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>{body}</div>}
      {action}
    </div>
  );
}

// ── Tailing tab ───────────────────────────────────────────────
// Per-followed-trader comparison. §4 (a real link table for multi-trader tailing)
// is deferred — only STW has picks in the DB today — but this is written over an
// array of traders + a per-trader row list, so a second source drops in without a
// rework. `pickMap.traders` and FOLLOWED_TRADERS are the seams.

// Oversized (heavier than the trader) and undersized (lighter) get DISTINCT colors via the
// shared sizingTone — amber vs blue — so a glance tells you which way you diverge, not just
// that you diverge (host, 2026-07-08). Same tone drives the detail pane's Tailing line.
function DeltaChip({ delta }: { delta: number | null }) {
  const tone = sizingTone(delta);
  return (
    <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, color: tone.textVar, background: tone.bgVar, border: `1px solid ${tone.borderVar}`, borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }}>
      {tone.label}
    </span>
  );
}

// A diverging bar centered on parity — fills right (oversized) or left (undersized),
// length ∝ |delta| (±5pp = full half). Fills the horizontal room the Tailing table used
// to leave blank, and reinforces the amber/blue direction split visually.
function SizingBar({ delta }: { delta: number | null }) {
  const tone = sizingTone(delta);
  if (delta === null) return null;
  const frac = Math.min(1, Math.abs(delta) / 5) * 50; // % of the full track (half each side)
  const over = delta > 0;
  return (
    <div style={{ position: 'relative', height: 8, width: '100%', minWidth: 90, background: 'var(--s2)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
      {tone.state !== 'inline' && (
        <div style={{ position: 'absolute', top: 1, bottom: 1, background: tone.textVar, borderRadius: 2, ...(over ? { left: '50%', width: `${frac}%` } : { right: '50%', width: `${frac}%` }) }} />
      )}
    </div>
  );
}

function TailingTab({ groups, portfolioValue, pickMap, decliningTailed, onSelectTicker }: {
  groups: PortfolioGroup[];
  portfolioValue: number;
  pickMap: Map<string, { conviction: number | null; basket: string; traders: string[]; stwWeight: number | null }>;
  decliningTailed: { ticker: string }[];
  onSelectTicker: (t: string) => void;
}) {
  const tailed = groups.filter((g) => g.isTailed);
  const untailed = groups.filter((g) => !g.isTailed);
  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {FOLLOWED_TRADERS.map((trader) => {
        const rows = tailed
          .filter((g) => g.traders.includes(trader))
          .map((g) => {
            const yourPct = portfolioValue > 0 ? (g.marketValue / portfolioValue) * 100 : 0;
            const stwWeight = pickMap.get(g.underlying)?.stwWeight ?? null;
            return { g, yourPct, stwWeight, delta: stwWeight !== null ? yourPct - stwWeight : null };
          })
          .sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity));
        return (
          <div key={trader} style={card}>
            <div style={{ padding: '10px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge kind="source" trader={trader} />
              <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>
                <strong style={{ color: 'var(--text)' }}>{rows.length}</strong> of {groups.length} positions tail {trader}
              </span>
            </div>
            {rows.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>No positions currently tail {trader}.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT_SIZE.xs }}>
                  <thead>
                    <tr>
                      <th style={th}>Ticker</th>
                      <th style={thR}>Your wt</th>
                      <th style={thR}>{trader} wt</th>
                      <th style={{ ...th, width: '45%' }}>Sizing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ g, yourPct, stwWeight, delta }) => (
                      <tr key={g.underlying}>
                        <td style={td}>
                          <TickerLink ticker={g.underlying} onSelect={onSelectTicker} />
                        </td>
                        <td style={{ ...tdR, color: 'var(--text)', fontWeight: 600 }}>{yourPct.toFixed(1)}%</td>
                        <td style={{ ...tdR, color: 'var(--t2)' }}>{stwWeight !== null ? `${stwWeight.toFixed(1)}%` : '—'}</td>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1 }}><SizingBar delta={delta} /></div>
                            <div style={{ flexShrink: 0, width: 120, textAlign: 'right' }}><DeltaChip delta={delta} /></div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {decliningTailed.length > 0 && (
        <div style={{ ...card, borderColor: 'var(--status-negative-border)' }}>
          <div style={{ padding: '10px 14px', fontSize: FONT_SIZE.sm, color: 'var(--status-negative-text)' }}>
            ⚠ Divergence — declining STW conviction on {decliningTailed.length} tailed position{decliningTailed.length !== 1 ? 's' : ''}:{' '}
            {decliningTailed.map((c, i) => (
              <span key={c.ticker}>
                {i > 0 && ', '}
                <TickerLink ticker={c.ticker} onSelect={onSelectTicker} />
              </span>
            ))}
          </div>
        </div>
      )}

      {untailed.length > 0 && (
        <div style={card}>
          <div style={{ padding: '10px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>
            <strong style={{ color: 'var(--text)' }}>{untailed.length}</strong> not tailed
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginBottom: 8 }}>
              You hold these; no followed trader currently tracks them.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {untailed.map((g) => (
                <span key={g.underlying} style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
                  {g.underlying}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
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
  // Persist the sub-tab in the URL (?tab=) so a refresh keeps you where you were,
  // instead of snapping back to Overview.
  const [activeTab, setActiveTab] = useState<PortfolioTab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return PORTFOLIO_TABS.some((x) => x.value === t) ? (t as PortfolioTab) : 'overview';
  });
  const capabilities = useCapabilities();

  // Own-position detail pane (list+detail pattern, mirroring PicksView.tsx) — desktop
  // resizable split, mobile full-screen swap.
  const [selected, setSelected] = useState<string | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const [listPct, setListPct] = useState(55);
  const [dragging, setDragging] = useState(false);

  const isConnected = !!(settings?.ibkr_flex_token && settings?.ibkr_query_id);

  // ticker → followed-trader pick (conviction + basket + STW's own weight). Single trader today;
  // structured for more.
  const pickMap = useMemo(() => {
    const m = new Map<string, { conviction: number | null; basket: string; traders: string[]; stwWeight: number | null }>();
    for (const h of stwHoldings) {
      m.set(h.ticker, { conviction: h.conviction ?? null, basket: h.basket ?? '', traders: [FOLLOWED_TRADERS[0]], stwWeight: h.current_weight ?? null });
    }
    return m;
  }, [stwHoldings]);

  // Declining-conviction alert (value-add, host-approved 2026-07-06): reuses the same
  // conviction-batch classification as the Overview's Conviction Changes block — a
  // tailed position whose latest webinar batch marked it down from where it was.
  // Must intersect against the SUBSCRIBER'S OWN held underlyings (not just pickMap,
  // which covers STW's entire tracked universe) — otherwise this leaks a declining-
  // conviction alert for every STW ticker, not just ones the subscriber actually tails.
  const heldUnderlyings = useMemo(
    () => new Set(positions.map((p) => cleanUnderlying(p.underlying))),
    [positions],
  );
  const holdingRefs = useMemo<HoldingRef[]>(
    () => stwHoldings.map((h) => ({ ticker: h.ticker, last_action: h.last_action ?? '', action_date: h.action_date ?? null })),
    [stwHoldings],
  );
  const convictionBatch = useConvictionChanges(holdingRefs);
  const decliningTailed = useMemo(
    () => (convictionBatch?.changes ?? []).filter((c) => c.dir === 'down' && pickMap.has(c.ticker) && heldUnderlyings.has(c.ticker)),
    [convictionBatch, pickMap, heldUnderlyings],
  );

  // The viewer's regime-light index (default IWM = STW's proxy; user can prefer
  // SPY/QQQ) + their own REGIME_EXIT rule (migration 063) — both used by the
  // Risk-tab RegimeLight below. Advisory / display-only.
  const regimeInstrument = useRegimeInstrumentStore((s) => s.instrument);
  const setRegimeInstrument = useRegimeInstrumentStore((s) => s.setInstrument);
  const regimeUserId = useAuthStore((s) => s.user?.id);
  const { data: regimeRiskConfig } = useRiskConfig(regimeUserId);
  const regimeExitRule = {
    trimToPct: regimeRiskConfig?.regime_trim_to_pct ?? DEFAULT_RISK_CONFIG.regime_trim_to_pct,
    stopPct: regimeRiskConfig?.regime_stop_pct ?? DEFAULT_RISK_CONFIG.regime_stop_pct,
    doubleRedGrossPct: regimeRiskConfig?.regime_doublered_gross_pct ?? DEFAULT_RISK_CONFIG.regime_doublered_gross_pct,
  };
  // One reconciliation of the drawdown ladder vs the double-RED regime target, computed
  // once here and passed to BOTH the RegimeLight and ViolationsSummary so they show the
  // identical binding gross number (never two conflicting targets).
  const bindingGross = useBindingGrossTarget(regimeRiskConfig, regimeInstrument);

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

  // Per-ticker technical read (own 9/21/200 trend structure + sector-rotation
  // standing) — the same RegimeBadge shown on the Stock Picks list/detail, now on
  // the list rows (compact = trend chip) + the detail pane header. One batched
  // TwelveData/Finnhub pass for the held underlyings (same pattern as PicksView).
  const portfolioTickers = useMemo(
    () => [...new Set(positions.map((p) => cleanUnderlying(p.underlying)))].filter((t) => t !== 'CASH'),
    [positions],
  );
  // Include the chosen regime index so the Risk tab can show ITS 9/21/200 structure
  // (the same batched pass; the index just isn't a list row).
  const regimeTickers = useMemo(
    () => [...new Set([regimeInstrument, ...portfolioTickers])],
    [regimeInstrument, portfolioTickers],
  );
  const { regimes } = useTickerRegime(regimeTickers, capabilities.finnhubKey, capabilities.twelveDataKey);

  // Heatmap cells — box ∝ market value, colored by total unrealized return. No "Today"
  // mode: the subscriber Flex feed carries no day-change field (positions render from the
  // stored sync, not a live quote). Untailed names group under "Other" in By-Basket view;
  // sector comes from the shared ticker_sector_map (By-Sector grouping).
  const { data: sectorMap } = useSectorMap();
  const heatmapCells = useMemo<HeatmapCell[]>(
    () => allGroups
      .filter((g) => g.marketValue > 0)
      .map((g) => ({ ticker: g.underlying, weight: g.marketValue, todayPct: null, totalPct: g.returnPct, basket: g.basket || 'Other', sector: sectorMap?.[g.underlying] ?? null })),
    [allGroups, sectorMap],
  );

  // §5.5 reverse cross-link: Stock Picks → "View your position" lands here with
  // ?ticker=; open that position's detail on the Positions tab, then clear the param.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const t = searchParams.get('ticker');
    if (!t || allGroups.length === 0) return;
    const upper = t.toUpperCase();
    if (allGroups.some((g) => g.underlying === upper)) {
      setSelected(upper);
      setActiveTab('positions');
      setSearchParams({ tab: 'positions' }, { replace: true }); // drop ?ticker, keep the tab
      return;
    }
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('ticker'); return p; }, { replace: true });
  }, [searchParams, allGroups, setSearchParams]);
  const baskets = useMemo(
    () => [...new Set(allGroups.filter((g) => g.isTailed && g.basket).map((g) => g.basket))].sort(),
    [allGroups],
  );
  // GICS market sectors present in the held book (from the shared ticker_sector_map).
  const sectors = useMemo(
    () => [...new Set(allGroups.map((g) => sectorMap?.[g.underlying]).filter((s): s is string => !!s))].sort(),
    [allGroups, sectorMap],
  );

  const matchFilters = (underlying: string, isTailed: boolean, basket: string, isOpt: boolean, conviction: number | null, regime: TickerRegime | undefined) => {
    const q = filters.search.trim().toUpperCase();
    if (filters.tailedOnly && !isTailed) return false;
    if (filters.type === 'stocks' && isOpt) return false;
    if (filters.type === 'options' && !isOpt) return false;
    if (filters.basket && basket !== filters.basket) return false;
    if (!matchConvictionBand(conviction, filters.conviction)) return false;
    if (filters.sector && (sectorMap?.[underlying] ?? '') !== filters.sector) return false;
    // Trend structure + sector-regime read from the per-ticker technical pass. When a
    // band is chosen and the regime is still loading/unknown, the row is excluded (it
    // genuinely isn't a match yet) — the count reflects only confirmed matches.
    if (filters.structure && regime?.bucket !== filters.structure) return false;
    if (filters.standing && regime?.standing !== filters.standing) return false;
    if (q && !underlying.toUpperCase().includes(q)) return false;
    return true;
  };
  const dir = filters.sort.endsWith('_asc') ? 1 : -1;
  const nl = (v: number | null) => (v == null ? Number.NEGATIVE_INFINITY : v);

  // grouped view rows
  const visibleGroups = useMemo<PortfolioGroup[]>(() => {
    const filtered = allGroups.filter((g) => matchFilters(g.underlying, g.isTailed, g.basket, g.hasOption && !g.hasStock, g.conviction, regimes[g.underlying]));
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
  }, [allGroups, filters, regimes, sectorMap]);

  // flat per-leg rows (default view)
  const visibleLegs = useMemo<LegRowData[]>(() => {
    const rows = positions.map((p) => {
      const underlying = cleanUnderlying(p.underlying);
      const pick = pickMap.get(underlying);
      return { p, underlying, isTailed: !!pick, traders: pick?.traders ?? [], conviction: pick?.conviction ?? null, basket: pick?.basket ?? '' };
    }).filter((r) => matchFilters(r.underlying, r.isTailed, r.basket, r.p.asset_class === 'OPT', r.conviction, regimes[r.underlying]));
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
  }, [positions, pickMap, filters, regimes, sectorMap]);

  const lastSynced = useMemo(() => {
    if (lastResult) return lastResult.lastSyncedAt;
    if (positions.length === 0) return null;
    return positions.reduce((max, p) => (p.last_synced_at > max ? p.last_synced_at : max), positions[0].last_synced_at);
  }, [positions, lastResult]);

  function toggleGroup(u: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(u) ? n.delete(u) : n.add(u); return n; });
  }
  // Clicking a ticker on My Portfolio opens the own-position detail pane (host decision,
  // 2026-07-06) instead of navigating straight to STW's tracked position — that's now an
  // explicit "View STW's tracked position" link inside the pane (onViewStwPosition below).
  const onSelectTicker = (t: string) => setSelected(t);
  const onViewStwPosition = () => { if (selected) navigate(`/picks?ticker=${encodeURIComponent(selected)}`); };

  const hasPositions = allGroups.length > 0;
  const grouped = filters.groupByTicker;
  const visibleCount = grouped ? visibleGroups.length : visibleLegs.length;
  const totalCount = grouped ? allGroups.length : positions.length;
  const pad = isMobile ? '14px 12px' : '20px 24px';

  const selectedGroup = selected ? allGroups.find((g) => g.underlying === selected) ?? null : null;
  const mobileDetail = isMobile && !!selectedGroup;

  const staleSyncWarning = lastSynced != null && Date.now() - new Date(lastSynced).getTime() > 24 * 3600 * 1000;

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    setDragging(true);
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setListPct(Math.min(80, Math.max(30, pct)));
    };
    const onUp = () => {
      setDragging(false);
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function detailPane() {
    if (!selectedGroup) return null;
    const detailGroup: DetailGroup = {
      underlying: selectedGroup.underlying, positions: selectedGroup.positions,
      netPnl: selectedGroup.netPnl, returnPct: selectedGroup.returnPct, marketValue: selectedGroup.marketValue,
      isTailed: selectedGroup.isTailed, traders: selectedGroup.traders, conviction: selectedGroup.conviction,
      hasStock: selectedGroup.hasStock, hasOption: selectedGroup.hasOption,
      companyName: stwHoldings.find((h) => h.ticker === selectedGroup.underlying)?.name ?? null,
      basket: selectedGroup.basket || null,
    };
    return (
      <PortfolioPositionDetail
        group={detailGroup}
        ownPortfolioPct={portfolioValue > 0 ? (selectedGroup.marketValue / portfolioValue) * 100 : null}
        stwWeight={pickMap.get(selectedGroup.underlying)?.stwWeight ?? null}
        showPnl={showPnl}
        tickerRegime={regimes[selectedGroup.underlying]}
        onClose={() => setSelected(null)}
        onViewStwPosition={onViewStwPosition}
      />
    );
  }

  const changeTab = (t: PortfolioTab) => {
    setActiveTab(t);
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('tab', t); return p; }, { replace: true });
    if (t !== 'positions') setSelected(null); // the detail pane belongs to Positions only
  };
  // From Overview's top-movers: jump to the position's detail on the Positions tab.
  const openPosition = (ticker: string) => { setSelected(ticker); changeTab('positions'); };

  // Global controls — sync status + P&L visibility + Sync — available on every tab.
  const globalControls = (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderBottom: '1px solid var(--bsub)' }}>
      {!isMobile && lastSynced && (
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', whiteSpace: 'nowrap' }}>Synced {fmtDateTime(lastSynced)}</span>
      )}
      <button onClick={() => setShowPnl((v) => !v)} title={showPnl ? 'Hide P&L' : 'Show P&L'}
        style={{ width: 34, height: 34, borderRadius: 6, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border)', color: showPnl ? 'var(--t2)' : 'var(--t3)', cursor: 'pointer', flexShrink: 0 }}>
        {showPnl ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        )}
      </button>
      <Button variant="primary" onClick={sync} disabled={isSyncing || !isConnected} style={{ flexShrink: 0 }}>
        {isSyncing ? 'Syncing…' : 'Sync'}
      </Button>
    </div>
  );

  // ── States with no tabs: not connected / loading / empty ──
  if (!isConnected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad }}>
          {syncError && <div style={{ marginBottom: 12 }}><AlertStrip severity="negative">{syncError}</AlertStrip></div>}
          <InfoCard title="Connect your IBKR account to see your positions here." body=""
            action={<Button variant="primary" onClick={() => navigate('/settings')} style={{ marginTop: 12 }}>Go to Settings →</Button>} />
        </div>
      </div>
    );
  }
  if (posLoading) {
    return <div style={{ height: '100%' }}><LoadingSpinner className="mt-16" /></div>;
  }
  if (!hasPositions) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {syncError && <AlertStrip severity="negative">{syncError}</AlertStrip>}
          <InfoCard title="No positions loaded yet." body="Click Sync to fetch your current IBKR positions."
            action={<Button variant="primary" onClick={sync} disabled={isSyncing} style={{ marginTop: 12 }}>{isSyncing ? 'Syncing…' : 'Sync'}</Button>} />
        </div>
      </div>
    );
  }

  // Mobile: an open position detail takes over the full screen (sub-nav + toolbar hide).
  if (mobileDetail) {
    return <div style={{ height: '100%', overflow: 'hidden' }}>{detailPane()}</div>;
  }

  // ── Tab bodies ──
  const overviewBody = (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad }}>
      {syncError && <div style={{ marginBottom: 12 }}><AlertStrip severity="negative">{syncError}</AlertStrip></div>}
      {staleSyncWarning && (
        <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 6, background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', color: 'var(--status-warning-text)', fontSize: FONT_SIZE.sm }}>
          Last synced {fmtDateTime(lastSynced!)} — numbers below may be stale. Click Sync to refresh.
        </div>
      )}
      {decliningTailed.length > 0 && (
        <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 6, background: 'var(--status-negative-bg)', border: '1px solid var(--status-negative-border)', color: 'var(--status-negative-text)', fontSize: FONT_SIZE.sm }}>
          ⚠ {decliningTailed.length} tailed position{decliningTailed.length !== 1 ? 's have' : ' has'} declining STW conviction: {decliningTailed.map((c) => c.ticker).join(', ')}
        </div>
      )}
      <PortfolioSummary
        groups={allGroups}
        showPnl={showPnl}
        onOpenTailing={() => changeTab('tailing')}
        onOpenLowConviction={() => {
          // Jump to Positions with the conviction filter pre-applied to exactly the
          // chip's set (tiers 1–2), so the user lands on the flagged positions.
          setFilters({ ...DEFAULT_PORTFOLIO_FILTERS, conviction: 'low' });
          changeTab('positions');
        }}
      />
      {showPnl && <TopMovers groups={allGroups} onOpenPosition={openPosition} />}
      {/* Heatmap colors by return, so it follows the P&L-visibility toggle like Top Movers. */}
      {showPnl && heatmapCells.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <PortfolioHeatmap cells={heatmapCells} onSelectTicker={openPosition} />
        </div>
      )}
    </div>
  );

  const riskBody = (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad }}>
      {/* Advisory regime light — shown to every portfolio user, driven by their
          chosen index (default IWM = STW's proxy; picker below persists per-user). */}
      <div style={{ marginBottom: SPACE[4], display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>Regime index</span>
          {/* Chips (same style as the Trend / Market Structure indicator toggles), not a dropdown. */}
          {REGIME_INSTRUMENTS.map((o) => {
            const active = regimeInstrument === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setRegimeInstrument(o.value)}
                title={o.label}
                style={{
                  fontSize: FONT_SIZE.xs, padding: '2px 10px', borderRadius: 4, border: '1px solid var(--border)',
                  background: active ? 'var(--acc)' : 'transparent',
                  color: active ? 'var(--text-inverse)' : 'var(--t2)', cursor: 'pointer', fontWeight: FONT_WEIGHT.semibold,
                }}
              >
                {o.value}
              </button>
            );
          })}
        </div>
        {/* One consolidated card: the frozen gate + the index's live 9/21/200
            structure, so there's no second block with a conflicting close. */}
        <RegimeLight instrument={regimeInstrument} exitRule={regimeExitRule} structure={regimes[regimeInstrument]} bindingGross={bindingGross} />
      </div>
      {capabilities.canUseLimits ? (
        <ViolationsSummary settingsTo="/settings" bindingGross={bindingGross} />
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>
          <strong style={{ color: 'var(--text)' }}>Risk limits 🔒</strong> — flag concentration and
          gross-exposure breaches in your own book, requires <strong style={{ color: 'var(--t2)' }}>Premium</strong>.
        </div>
      )}
    </div>
  );

  const tailingBody = (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad }}>
      <TailingTab groups={allGroups} portfolioValue={portfolioValue} pickMap={pickMap} decliningTailed={decliningTailed} onSelectTicker={onSelectTicker} />
    </div>
  );

  const positionsBody = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
      {/* Filter toolbar — scoped to Positions only */}
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', flexShrink: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', minWidth: 'max-content' }}>
          <PortfolioFilterBar filters={filters} onChange={setFilters} baskets={baskets} sectors={sectors} filtered={visibleCount} total={totalCount} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
          <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>📊 Positions</span>
            <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginLeft: 'auto' }}>{visibleCount}</span>
          </div>
          {visibleCount === 0 ? (
            <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', padding: '12px 13px' }}>No positions match your filters.</p>
          ) : grouped ? (
            <>
              {!isMobile && showPnl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, color: 'var(--t3)' }}>
                  <span style={{ width: 8, flexShrink: 0 }} />
                  <span style={{ width: 3, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>Ticker</span>
                  <span style={{ width: COL.ret, textAlign: 'right', flexShrink: 0 }}>Weight</span>
                  <span style={{ width: COL.pnl, textAlign: 'right', flexShrink: 0 }}>P&L</span>
                  <span style={{ width: COL.val, textAlign: 'right', flexShrink: 0 }}>Value</span>
                </div>
              )}
              <AccordionList
                items={visibleGroups}
                rowKey={(g) => g.underlying}
                expandedKeys={expanded}
                onToggle={toggleGroup}
                accentColor={(g) => (g.conviction !== null ? (TIERS[g.conviction]?.color ?? 'var(--border)') : 'var(--border)')}
                renderHeader={(g) => (
                  <GroupHeader group={g} onSelectTicker={onSelectTicker} showPnl={showPnl} isMobile={isMobile} portfolioValue={portfolioValue} regime={regimes[g.underlying]} />
                )}
                renderExpanded={(g) => (
                  <>
                    <PositionMetrics group={g} portfolioValue={portfolioValue} showPnl={showPnl} />
                    {g.positions.map((p) => <LegRow key={p.id} pos={p} showPnl={showPnl} />)}
                  </>
                )}
              />
            </>
          ) : (
            <FlatTable rows={visibleLegs} onSelectTicker={onSelectTicker} showPnl={showPnl} isMobile={isMobile} portfolioValue={portfolioValue} regimes={regimes} />
          )}
        </div>
      </div>
    </div>
  );

  // Positions tab: desktop list+detail resizable split when a ticker is open.
  const positionsPane = (!isMobile && selectedGroup) ? (
    <div ref={splitRef} style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
      <div style={{ flex: `0 0 ${listPct}%`, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {positionsBody}
      </div>
      <div onMouseDown={startResize} style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: dragging ? 'var(--acc)' : 'var(--border)' }} />
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', borderLeft: '1px solid var(--bsub)' }}>
        {detailPane()}
      </div>
    </div>
  ) : positionsBody;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Secondary nav (left) + global controls (right) share one bar */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--surface)', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          <SubNav items={PORTFOLIO_TABS} active={activeTab} onChange={changeTab} />
        </div>
        {globalControls}
      </div>

      {activeTab === 'overview' ? overviewBody
        : activeTab === 'risk' ? riskBody
        : activeTab === 'tailing' ? tailingBody
        : positionsPane}
    </div>
  );
}
