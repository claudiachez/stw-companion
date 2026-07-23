import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TIERS, fmtDateTime, sizingTone, matchConvictionBand, DEFAULT_PER_STOCK_LADDER, cashflowAdjustedDrawdownPct, drawdownLadderStatus, DRAWDOWN_NEAR_BAND_PP, classifySeverity, isNonEquityBucket, GICS_SECTORS, type ViolationSeverity, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '@stw/shared';
import { useUserPositions, useIbkrSettings, useUserExecutions } from './useUserPositions';
import { usePerStockLadders, type PerStockLadderInfo } from './usePerStockLadders';
import { PerStockLadderChip } from './PerStockLadder';
import { useSyncPortfolio } from './useSyncPortfolio';
import { useHoldings } from '../picks/useHoldings';
import { useConvictionChanges, type HoldingRef } from '../picks/useConvictionChanges';
import { useTickerRegime, type TickerRegime } from '../picks/useTickerRegime';
import { RegimeBadge } from '../picks/components/RegimeBadge';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { TickerLink } from '../../primitives/TickerLink';
import { Badge } from '../../primitives/Badge';
import { Button } from '../../primitives/Button';
import { AlertStrip } from '../../primitives/AlertStrip';
import { StatusPill } from '../../primitives/StatusPill';
import { PortfolioHeatmap, type HeatmapCell } from '../../components/PortfolioHeatmap';
import { AccordionList } from '../../primitives/AccordionList';
import { SubNav } from '../../primitives/SubNav';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCapabilities } from '../../context/AppCapabilities';
import { useLiveQuotes } from '../../hooks/useLiveQuotes';
import { ViolationsSummary } from '../limits/ViolationsSummary';
import { useBindingGrossTarget } from '../limits/useBindingGrossTarget';
import { useLiveNlv } from './useLiveNlv';
import { useSectorMap, useRiskConfig } from '../limits/useRiskConfig';
import { useRegimeInstrumentStore } from '../regime/useRegimeInstrument';
import { useAuthStore } from '../../store/auth';
import { usePrivacyStore } from '../../store/privacy';
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

// flat-table cell styles — copied from the Trades blotter so the two tables read identically
const th: React.CSSProperties = { textAlign: 'left', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, color: 'var(--t3)', background: 'var(--s2)', padding: '7px 13px', borderBottom: '1px solid var(--bsub)', whiteSpace: 'nowrap' };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '9px 13px', borderBottom: '1px solid var(--bsub)', verticalAlign: 'middle', lineHeight: 1.4, whiteSpace: 'nowrap' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

// `signed` prefixes a GAIN with "+" (for P&L), matching the design; losses keep "-$…",
// neutral totals (account value, market value, trim amounts) pass signed=false.
function fmtMoney(n: number | null, signed = false): string {
  if (n === null) return '—';
  const s = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  return signed && n > 0 ? `+${s}` : s;
}
function fmtMoneyCompact(n: number | null, signed = false): string {
  if (n === null) return '—';
  const s = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return signed && n > 0 ? `+${s}` : s;
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

// Row sub-line: for a single-lot position, the ref shows the entry detail ("Shares · 43 @ avg
// $65.02"); mixed/multi-leg groups keep the composition summary.
function entryDetail(g: PortfolioGroup): string {
  const c = composition(g);
  if (g.positions.length === 1) {
    const p = g.positions[0];
    if (p.quantity != null && p.avg_cost != null) {
      return `${c} · ${Math.round(Math.abs(p.quantity))} @ avg $${p.avg_cost.toFixed(2)}`;
    }
  }
  return c;
}

// ── flat table (default view) ─────────────────────────────────

interface LegRowData {
  p: UserPosition;
  underlying: string;
  isTailed: boolean;
  traders: string[];
  conviction: number | null;
}

function FlatLegRow({ row, onSelectTicker, showMoney, isMobile, portfolioValue, regime, ladderInfo }: { row: LegRowData; onSelectTicker: (t: string) => void; showMoney: boolean; isMobile: boolean; portfolioValue: number; regime?: TickerRegime; ladderInfo?: PerStockLadderInfo }) {
  const { p, underlying, isTailed, traders } = row;
  const weightPct = portfolioValue > 0 ? (posMV(p) / portfolioValue) * 100 : null;
  return (
    <tr>
      <td style={td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Every position opens its own detail pane, tailed or not (host, 2026-07-08). */}
          <TickerLink ticker={underlying} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold }} />
          {isTailed && traders.map((t) => <Badge key={t} kind="source" trader={t} />)}
          {/* Compact = trend-structure chip only (matches the Stock Picks list rows). */}
          <RegimeBadge regime={regime} compact />
          {/* Per-stock drawdown stop — only on the stock leg, only when it needs attention. */}
          {p.asset_class === 'STK' && <PerStockLadderChip info={ladderInfo} />}
        </div>
        <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 1 }}>{instrumentLabel(p)}</div>
      </td>
      {!isMobile && <td style={{ ...td, color: 'var(--t2)' }}>{typeLabel(p)}</td>}
      {!isMobile && showMoney && <td style={{ ...tdR, color: 'var(--t2)' }}>{fmtPrice(p.avg_cost)}</td>}
      {!isMobile && showMoney && <td style={{ ...tdR, color: 'var(--t2)' }}>{fmtPrice(p.mark_price)}</td>}
      {!isMobile && showMoney && <td style={{ ...tdR, color: 'var(--t2)' }}>{fmtMoney(posMV(p))}</td>}
      <td style={{ ...tdR, color: 'var(--t2)' }}>{weightPct !== null ? `${weightPct.toFixed(1)}%` : '—'}</td>
      {showMoney && <td style={{ ...tdR, color: pnlColor(p.unrealized_pnl), fontWeight: 600 }}>{fmtMoney(p.unrealized_pnl, true)}</td>}
    </tr>
  );
}

function FlatTable({ rows, onSelectTicker, showMoney, isMobile, portfolioValue, regimes, perStockLadders }: { rows: LegRowData[]; onSelectTicker: (t: string) => void; showMoney: boolean; isMobile: boolean; portfolioValue: number; regimes: Record<string, TickerRegime>; perStockLadders: Map<string, PerStockLadderInfo> }) {
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 9 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT_SIZE.xs }}>
        <thead>
          <tr>
            <th style={th}>Ticker</th>
            {!isMobile && <th style={th}>Type</th>}
            {!isMobile && showMoney && <th style={thR}>Avg Cost</th>}
            {!isMobile && showMoney && <th style={thR}>Mark</th>}
            {!isMobile && showMoney && <th style={thR}>Value</th>}
            <th style={thR} title="Position market value as a % of your whole book — the figure the limits engine judges you on">Weight</th>
            {showMoney && <th style={thR}>P&L</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <FlatLegRow key={r.p.id} row={r} onSelectTicker={onSelectTicker} showMoney={showMoney} isMobile={isMobile} portfolioValue={portfolioValue} regime={regimes[r.underlying]} ladderInfo={perStockLadders.get(r.underlying)} />)}
        </tbody>
      </table>
    </div>
  );
}

// ── grouped view (accordion, on "Group by ticker") ────────────

function LegRow({ pos, showMoney }: { pos: UserPosition; showMoney: boolean }) {
  const isOpt = pos.asset_class === 'OPT';
  const qty = pos.quantity ?? 0;
  const label = isOpt
    ? `${Math.abs(qty)}× $${pos.strike}${pos.put_call} ${fmtExpiry(pos.expiry)}`
    : `${Math.abs(qty).toLocaleString()} share${Math.abs(qty) !== 1 ? 's' : ''} @ ${pos.avg_cost != null ? `$${pos.avg_cost.toFixed(2)}` : '—'}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px 7px 40px', borderBottom: '1px solid var(--bsub)', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{
          // Option-leg kind chip uses the semantic info token (not a raw sky-blue rgba) per the
          // Listing Pages redesign; STOCK stays neutral.
          fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.05em', padding: '1px 6px', borderRadius: 4, flexShrink: 0,
          color: isOpt ? 'var(--status-info-text)' : 'var(--t2)', background: isOpt ? 'var(--status-info-bg)' : 'var(--s2)',
          border: isOpt ? '1px solid var(--status-info-border)' : '1px solid var(--border)',
        }}>
          {isOpt ? `${qty < 0 ? 'SHORT ' : ''}${pos.put_call === 'C' ? 'CALL' : 'PUT'}` : 'STOCK'}
        </span>
        <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      {showMoney && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {pos.unrealized_pnl_pct !== null && <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: pnlColor(pos.unrealized_pnl_pct), fontVariantNumeric: 'tabular-nums' }}>{fmtPct(pos.unrealized_pnl_pct)}</div>}
          {pos.unrealized_pnl !== null && <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(pos.unrealized_pnl, true)}</div>}
        </div>
      )}
    </div>
  );
}

function PositionMetrics({ group, portfolioValue, showMoney }: { group: PortfolioGroup; portfolioValue: number; showMoney: boolean }) {
  const split = group.sharesValue + group.optionsValue;
  const sharesPct = split > 0 ? Math.round((group.sharesValue / split) * 100) : null;
  const optionsPct = sharesPct !== null ? 100 - sharesPct : null;
  const hasBoth = group.hasStock && group.hasOption;
  const impactPct = portfolioValue > 0 ? (group.optionsRisk / portfolioValue) * 100 : null;
  const showRisk = group.hasOption && showMoney;
  if (!hasBoth && !showRisk) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 16px', padding: '6px 14px 6px 41px', background: 'var(--bg)', borderBottom: '1px solid var(--bsub)', fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>
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
function GroupHeader({ group, onSelectTicker, showMoney, isMobile, portfolioValue, maxWeight, regime, ladderInfo }: {
  group: PortfolioGroup; onSelectTicker: (t: string) => void; showMoney: boolean; isMobile: boolean; portfolioValue: number; maxWeight: number; regime?: TickerRegime; ladderInfo?: PerStockLadderInfo;
}) {
  const { underlying, netPnl, marketValue, isTailed, traders, conviction, basket } = group;
  const weightPct = portfolioValue > 0 ? (marketValue / portfolioValue) * 100 : null;
  const barColor = conviction !== null ? (TIERS[conviction]?.color ?? 'var(--border)') : 'var(--border)';
  const barW = weightPct !== null && maxWeight > 0 ? `${Math.min(100, (weightPct / maxWeight) * 100)}%` : '0%';
  // Right metric cluster (ref anatomy): weight mini-bar + P&L + "value · weight%" subline.
  const cluster = (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 72 }}>
      {!isMobile && (
        <div style={{ width: 48, height: 3, borderRadius: 2, background: 'var(--bsub)' }}>
          <div style={{ width: barW, height: '100%', borderRadius: 2, background: barColor }} />
        </div>
      )}
      <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: pnlColor(netPnl), fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(netPnl, true)}</div>
      {marketValue > 0 && (
        <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
          {fmtMoney(marketValue)}{weightPct !== null ? ` · ${weightPct.toFixed(1)}%` : ''}
        </div>
      )}
    </div>
  );
  return (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1, flexWrap: 'wrap' }}>
          {/* Every position's ticker links to its own detail pane, tailed or not. */}
          <span onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
            <TickerLink ticker={underlying} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold }} />
          </span>
          {isTailed
            ? <>{traders.map((t) => <Badge key={t} kind="source" trader={t} />)}{basket && <Badge kind="category" category={basket} />}</>
            : <span style={{ fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4, color: 'var(--t2)', background: 'var(--s2)', border: '1px solid var(--border)', flexShrink: 0 }}>Your call</span>}
          {/* Per-stock drawdown stop for the group's underlying (shown only when actionable). */}
          <PerStockLadderChip info={ladderInfo} />
          {/* Compact = trend-structure chip only (matches the Stock Picks list rows). */}
          <RegimeBadge regime={regime} compact />
        </div>
        <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entryDetail(group)}</div>
      </div>
      {showMoney && cluster}
    </>
  );
}

// ── Overview tab (redesign — plans/20260720_webapp_redesign) ──────────────────
// Shared card idiom for every Overview block: surface + border + 12px radius + 16 pad.
const overviewCard: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 };
// Uppercase eyebrow label idiom (matches the KpiCard / section-header treatment).
const eyebrow: React.CSSProperties = { fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color: 'var(--t3)' };
// Money hidden → percentages still show (the privacy pref's whole point); $ becomes a mask.
const MONEY_MASK = '••••';

// Sector swatch palette — one distinct token per GICS sector (index-stable so a sector
// always keeps its color), neutral gray for anything unmapped. Tokens only, never literal.
const SECTOR_PALETTE = [
  'var(--c4)', 'var(--c5)', 'var(--c3)', 'var(--sentiment-greed)',
  'var(--status-elevated)', 'var(--c1)', 'var(--c4l)', 'var(--c5l)',
  'var(--c3l)', 'var(--c1l)', 'var(--c0l)',
];
function sectorColor(sector: string): string {
  const i = (GICS_SECTORS as readonly string[]).indexOf(sector);
  return i >= 0 ? SECTOR_PALETTE[i % SECTOR_PALETTE.length] : 'var(--c2)';
}

interface SectorRow {
  sector: string;
  mv: number;
  /** % of the account (NLV) — the exact figure the sector cap judges (one source w/ Risk). */
  exposurePct: number;
  severity: ViolationSeverity;
  color: string;
}

// One source for the Overview's sector concentration: same denominator (account NLV) and
// the same classifySeverity thresholds the Risk-tab limits engine uses, so "over cap" here
// can never disagree with the Risk verdict. ETF/Cash excluded (not an equity sector).
function computeSectorRows(groups: PortfolioGroup[], sectorMap: Record<string, string> | undefined, nlv: number | null, sectorCap: number): SectorRow[] {
  const gross = groups.reduce((s, g) => s + g.marketValue, 0);
  const denom = nlv && nlv > 0 ? nlv : gross;
  const bySector = new Map<string, number>();
  for (const g of groups) {
    const sector = sectorMap?.[g.underlying];
    if (!sector || isNonEquityBucket(sector)) continue;
    bySector.set(sector, (bySector.get(sector) ?? 0) + g.marketValue);
  }
  return [...bySector.entries()]
    .map(([sector, mv]) => {
      const exposurePct = denom > 0 ? (mv / denom) * 100 : 0;
      return { sector, mv, exposurePct, severity: classifySeverity(exposurePct, sectorCap), color: sectorColor(sector) };
    })
    .sort((a, b) => b.mv - a.mv);
}

// Risk warnings surfaced on Overview (Item 3 in-app) — condensed one-liners for the
// attention strip, all read from data already computed on the page (never recomputed here).
interface OverviewWarnings {
  drawdownSeverity: 'near' | 'breach' | null;
  drawdownPct: number | null;
  /** Names near OR past a per-stock stop (needs attention). */
  stopAttention: number;
  /** Subset past a stop and not yet trimmed (breach). */
  stopBreach: number;
  /** Sectors near OR over the concentration cap. */
  capAttention: number;
  /** Subset strictly over the cap (a breach). */
  capBreach: number;
}

// Attention strip (§2) — state-colored to the worst severity, aggregating the SAME risk
// verdict the Risk tab shows, condensed to one line each. It only LINKS to Risk/Positions;
// it never re-runs the risk math or duplicates the full cards (three de-risking surfaces
// stay distinct).
function AttentionStrip({ warnings, sectorCap, onOpenRisk, onOpenStops }: {
  warnings: OverviewWarnings; sectorCap: number; onOpenRisk: () => void; onOpenStops: () => void;
}) {
  interface Row { key: string; sev: 'near' | 'breach'; text: string; go: string; onClick: () => void; }
  const rows: Row[] = [];
  if (warnings.drawdownSeverity) {
    const dd = warnings.drawdownPct;
    rows.push({
      key: 'dd', sev: warnings.drawdownSeverity, go: 'Risk', onClick: onOpenRisk,
      text: `Your account is ${dd != null ? `down ${Math.abs(dd).toFixed(1)}% from its peak` : 'drawing down'} — ${warnings.drawdownSeverity === 'breach' ? 'past a de-risking step' : 'nearing a de-risking step'}`,
    });
  }
  if (warnings.stopAttention > 0) {
    rows.push({
      key: 'stop', sev: warnings.stopBreach > 0 ? 'breach' : 'near', go: 'Review', onClick: onOpenStops,
      text: `${warnings.stopAttention} position${warnings.stopAttention === 1 ? '' : 's'} ${warnings.stopBreach > 0 ? 'past' : 'near'} a per-stock stop`,
    });
  }
  if (warnings.capAttention > 0) {
    rows.push({
      key: 'cap', sev: warnings.capBreach > 0 ? 'breach' : 'near', go: 'Risk', onClick: onOpenRisk,
      text: `${warnings.capAttention} sector${warnings.capAttention === 1 ? '' : 's'} ${warnings.capBreach > 0 ? 'over' : 'near'} your ${sectorCap}% cap`,
    });
  }

  const worst: 'positive' | 'warning' | 'negative' = rows.some((r) => r.sev === 'breach') ? 'negative' : rows.length ? 'warning' : 'positive';
  const pill = worst === 'negative' ? 'Action' : worst === 'warning' ? 'Heads up' : 'All clear';
  const headline = worst === 'negative' ? 'A few things need your attention'
    : worst === 'warning' ? 'A couple of things to keep an eye on'
    : 'Nothing needs your attention right now';

  return (
    <div style={{ background: `var(--status-${worst}-bg)`, border: `1px solid var(--status-${worst}-border)`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <StatusPill variant={worst === 'negative' ? 'breach' : worst === 'warning' ? 'warning' : 'ok'}>{pill}</StatusPill>
        <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{headline}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ marginTop: 6, fontSize: FONT_SIZE.sms, color: 'var(--t2)', lineHeight: 1.5 }}>
          No drawdown steps, per-stock stops, or sector caps are triggered.{' '}
          <button onClick={onOpenRisk} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--acc)', fontWeight: FONT_WEIGHT.semibold }}>See the full Risk tab →</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {rows.map((r) => (
            <button key={r.key} onClick={r.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--bsub)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
              <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 999, background: `var(--status-${r.sev === 'breach' ? 'negative' : 'warning'}-text)` }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: FONT_SIZE.sms, color: 'var(--text)', lineHeight: 1.5 }}>{r.text}</span>
              <span style={{ flexShrink: 0, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)', whiteSpace: 'nowrap' }}>{r.go} →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// §1–3: account-value hero, attention strip, at-a-glance stats. Every number carries its
// source (live NLV / positions mark) and reuses the same group totals as the Positions tab.
function PortfolioSummary({ groups, showMoney, nlv, warnings, sectorCap, onOpenRisk, onOpenStops }: {
  groups: PortfolioGroup[]; showMoney: boolean;
  /** LIVE account Net Liquidation Value (useLiveNlv) — positions market value + cash/margin. */
  nlv: number | null;
  warnings: OverviewWarnings;
  sectorCap: number;
  onOpenRisk: () => void;
  onOpenStops: () => void;
}) {
  const t = useMemo(() => {
    let mv = 0, pnl = 0, cost = 0, legs = 0, sharesVal = 0, optVal = 0, optRisk = 0;
    for (const g of groups) {
      mv += g.marketValue; pnl += g.netPnl; cost += g.costBasis; legs += g.positions.length;
      sharesVal += g.sharesValue; optVal += g.optionsValue; optRisk += g.optionsRisk;
    }
    const split = sharesVal + optVal;
    const equityPct = split > 0 ? Math.round((sharesVal / split) * 100) : null;
    return {
      mv, pnl, legs, optRisk,
      retPct: cost > 0 ? (pnl / cost) * 100 : null,
      equityPct, optionsPct: equityPct !== null ? 100 - equityPct : null,
      grossPct: nlv && nlv > 0 ? (mv / nlv) * 100 : null,
      optRiskPct: nlv && nlv > 0 ? (optRisk / nlv) * 100 : null,
    };
  }, [groups, nlv]);

  const positionCount = groups.length;
  const cashMargin = nlv != null ? nlv - t.mv : null;

  const stat = (label: string, big: React.ReactNode, color: string, sub: string) => (
    <div key={label} style={{ ...overviewCard, padding: '12px 14px' }}>
      <div style={{ ...eyebrow, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color, fontVariantNumeric: 'tabular-nums' }}>{big}</div>
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.45, marginTop: 2 }}>{sub}</div>
    </div>
  );

  return (
    <>
      {/* §1 — account value hero */}
      <div style={overviewCard}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ ...eyebrow, marginBottom: 2 }}>Your account is worth</div>
            <div style={{ fontSize: FONT_SIZE.hero, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
              {showMoney ? (nlv != null ? fmtMoney(nlv) : '—') : MONEY_MASK}
            </div>
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginTop: 4 }}>
              {!showMoney
                ? `${positionCount} position${positionCount === 1 ? '' : 's'} · dollar amounts hidden`
                : nlv != null && cashMargin != null
                ? `${fmtMoney(t.mv)} in positions ${cashMargin >= 0 ? '+' : '−'} ${fmtMoney(Math.abs(cashMargin))} ${cashMargin >= 0 ? 'cash' : 'margin'}`
                : `${fmtMoney(t.mv)} in positions`}
            </div>
          </div>
          <div style={{ minWidth: 180 }}>
            <div style={{ ...eyebrow, marginBottom: 2 }}>Open positions are</div>
            <div style={{ fontSize: FONT_SIZE.hero, fontWeight: FONT_WEIGHT.bold, color: pnlColor(t.pnl), fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
              {showMoney ? `${t.pnl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(t.pnl))}` : MONEY_MASK}
            </div>
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginTop: 4 }}>
              {t.retPct != null ? `${t.pnl >= 0 ? 'up' : 'down'} ${Math.abs(t.retPct).toFixed(1)}% vs what you paid — open positions only` : 'open positions only'}
            </div>
          </div>
        </div>
      </div>

      {/* §2 — attention strip */}
      <AttentionStrip warnings={warnings} sectorCap={sectorCap} onOpenRisk={onOpenRisk} onOpenStops={onOpenStops} />

      {/* §3 — at-a-glance stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
        {stat('Positions', positionCount, 'var(--text)', `${t.legs} holding${t.legs === 1 ? '' : 's'} (legs)`)}
        {stat('How much is invested', t.grossPct != null ? `${t.grossPct.toFixed(0)}%` : '—', t.grossPct != null && t.grossPct > 100 ? 'var(--pnl-loss)' : 'var(--text)', 'gross exposure vs account')}
        {stat('Shares : Options', t.equityPct != null ? `${t.equityPct} : ${t.optionsPct}` : '—', 'var(--text)', 'by current market value')}
        {stat('Options at risk', showMoney ? fmtMoneyCompact(t.optRisk) : MONEY_MASK, 'var(--text)', t.optRiskPct != null ? `${t.optRiskPct.toFixed(1)}% of your account` : 'premium at risk')}
      </div>
    </>
  );
}

// §4 — "What's moving your P&L" (showMoney only). Two columns of the top-3 gainers /
// losers by unrealized $ (return % isn't in the subscriber Flex feed, so $ is the only
// reliable mover metric). Bar length ∝ |pnl| / max across both lists. Click → open it.
function MoversCard({ groups, portfolioValue, onOpenPosition }: { groups: PortfolioGroup[]; portfolioValue: number; onOpenPosition: (t: string) => void }) {
  const withPnl = groups.filter((g) => g.netPnl !== 0);
  const gainers = [...withPnl].filter((g) => g.netPnl > 0).sort((a, b) => b.netPnl - a.netPnl).slice(0, 3);
  const losers = [...withPnl].filter((g) => g.netPnl < 0).sort((a, b) => a.netPnl - b.netPnl).slice(0, 3);
  if (gainers.length === 0 && losers.length === 0) return null;
  const maxAbs = Math.max(1, ...withPnl.map((g) => Math.abs(g.netPnl)));

  const column = (title: string, rows: PortfolioGroup[], color: string) => (
    <div>
      <div style={{ ...eyebrow, color, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.length === 0 ? (
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', padding: '5px 0' }}>None</div>
        ) : rows.map((g) => {
          const wt = portfolioValue > 0 ? (g.marketValue / portfolioValue) * 100 : null;
          const barW = `${Math.round((Math.abs(g.netPnl) / maxAbs) * 100)}%`;
          return (
            <button key={g.underlying} onClick={() => onOpenPosition(g.underlying)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: '5px 0', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
              <span style={{ width: 52, flexShrink: 0, fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color }}>{g.underlying}</span>
              <span style={{ width: 44, flexShrink: 0, fontSize: FONT_SIZE.xs, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{wt != null ? `${wt.toFixed(1)}%` : '—'}</span>
              <span style={{ flex: 1, height: 8, background: 'var(--s2)', borderRadius: 4, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: barW, background: color, borderRadius: 4 }} />
              </span>
              <span style={{ width: 64, flexShrink: 0, textAlign: 'right', fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.semibold, color, fontVariantNumeric: 'tabular-nums' }}>{fmtMoneyCompact(g.netPnl, true)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={overviewCard}>
      <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)', marginBottom: 2 }}>What&rsquo;s moving your P&amp;L</div>
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginBottom: 12 }}>Biggest unrealized gains and losses across your open positions. Click a name to open it.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 16 }}>
        {column('Working for you', gainers, 'var(--pnl-gain)')}
        {column('Working against you', losers, 'var(--pnl-loss)')}
      </div>
    </div>
  );
}

// §5 — "Where your money is": a stacked sector bar + legend, and (showMoney only) the
// shared PortfolioHeatmap treemap with its By basket / By sector toggle, plus an over-cap
// callout that links to the Risk tab. All sector reads come from computeSectorRows (one
// source with the Risk verdict).
function ConcentrationCard({ sectors, sectorCap, showMoney, heatmapCells, onSelectTicker, onOpenRisk }: {
  sectors: SectorRow[]; sectorCap: number; showMoney: boolean;
  heatmapCells: HeatmapCell[]; onSelectTicker: (t: string) => void; onOpenRisk: () => void;
}) {
  if (sectors.length === 0 && heatmapCells.length === 0) return null;
  const overCap = sectors.filter((s) => s.severity === 'breach');
  return (
    <div style={overviewCard}>
      <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)', marginBottom: 2 }}>Where your money is</div>
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginBottom: 12 }}>Your book by sector. Your cap: no sector over {sectorCap}% of your account.</div>
      {sectors.length > 0 && (
        <>
          <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--bsub)' }}>
            {sectors.map((s) => (
              <div key={s.sector} title={`${s.sector} · ${s.exposurePct.toFixed(1)}%`} style={{ width: `${s.exposurePct}%`, background: s.color, opacity: 0.85 }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 10 }}>
            {sectors.map((s) => {
              const over = s.severity === 'breach';
              const near = s.severity === 'near';
              return (
                <span key={s.sector} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                  {s.sector}{' '}
                  <b style={{ color: over ? 'var(--status-negative-text)' : near ? 'var(--status-warning-text)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{s.exposurePct.toFixed(1)}%</b>
                  {over && <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--status-negative-text)' }}>⚠ over cap</span>}
                </span>
              );
            })}
          </div>
        </>
      )}
      {showMoney && heatmapCells.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <PortfolioHeatmap cells={heatmapCells} onSelectTicker={onSelectTicker} title="By position" />
        </div>
      )}
      {overCap.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <AlertStrip severity="negative" action={{ label: 'See it on the Risk tab →', onClick: onOpenRisk }}>
            {overCap.map((s) => s.sector).join(', ')} {overCap.length === 1 ? 'is' : 'are'} over your {sectorCap}% sector cap.
          </AlertStrip>
        </div>
      )}
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

// A diverging bar centered on parity — fills RIGHT/amber (you hold more) or LEFT/info
// (you hold less), length ∝ |delta| (±5pp = full half). Matched (within the sizingTone
// band) shows a small centered positive mark. The undersized "you hold less" color maps to
// our existing info token (via sizingTone → --status-info-*), NOT a new sky-blue token
// (host directive on the redesign ref).
function SizingBar({ delta }: { delta: number | null }) {
  const tone = sizingTone(delta, 1); // ±1pt band = "matched" (per the redesign's demo logic)
  if (delta === null) return <div style={{ height: 10, width: '100%', minWidth: 90, background: 'var(--s2)', borderRadius: 5 }} />;
  const frac = Math.min(1, Math.abs(delta) / 5) * 50; // % of the full track (half each side)
  const over = delta > 0;
  return (
    <div style={{ position: 'relative', height: 10, width: '100%', minWidth: 90, background: 'var(--s2)', borderRadius: 5, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
      {tone.state === 'inline' ? (
        <div style={{ position: 'absolute', top: 1, bottom: 1, left: 'calc(50% - 3px)', width: 6, borderRadius: 3, background: 'var(--status-positive-text)' }} />
      ) : (
        <div style={{ position: 'absolute', top: 1, bottom: 1, background: tone.textVar, borderRadius: 3, ...(over ? { left: '50%', width: `${frac}%` } : { right: '50%', width: `${frac}%` }) }} />
      )}
    </div>
  );
}

// Numeric conviction line under a tailed name ("conviction 5/5"), muted; turns red with a
// ▼ when the latest webinar batch marked it down (declining set) — matches the redesign,
// which shows STW's 1–5 rating, not a word band.
function ConvictionNote({ conviction, declining }: { conviction: number | null; declining: boolean }) {
  if (conviction == null) return null;
  return (
    <span style={{ display: 'block', fontSize: FONT_SIZE['3xs'], color: declining ? 'var(--status-negative-text)' : 'var(--t3)', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
      conviction {conviction}/5{declining ? ' ▼' : ''}
    </span>
  );
}

function TailingTab({ groups, portfolioValue, pickMap, decliningTailed, showMoney, isMobile, onSelectTicker }: {
  groups: PortfolioGroup[];
  portfolioValue: number;
  pickMap: Map<string, { conviction: number | null; basket: string; traders: string[]; stwWeight: number | null; stwActive: boolean }>;
  decliningTailed: { ticker: string }[];
  showMoney: boolean;
  isMobile: boolean;
  onSelectTicker: (t: string) => void;
}) {
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const trader = FOLLOWED_TRADERS[0]; // only STW has picks in the DB today; structured for more
  const decliningSet = useMemo(() => new Set(decliningTailed.map((c) => c.ticker)), [decliningTailed]);

  const untailed = groups.filter((g) => !g.isTailed);
  // A pick STW has EXITED (closed / zero weight) but you still hold — shown beside "your own
  // calls", NOT in the sizing comparison (comparing your size to their 0% reads as a false
  // "you hold way more", when the real story is "STW is out").
  const isActive = (g: PortfolioGroup) => pickMap.get(g.underlying)?.stwActive ?? false;
  const exited = useMemo(() => groups
    .filter((g) => g.isTailed && g.traders.includes(trader) && !isActive(g))
    .map((g) => ({ g, yourPct: portfolioValue > 0 ? (g.marketValue / portfolioValue) * 100 : 0 }))
    .sort((a, b) => b.yourPct - a.yourPct),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, trader, portfolioValue, pickMap]);
  const rows = useMemo(() => groups
    .filter((g) => g.isTailed && g.traders.includes(trader) && isActive(g))
    .map((g) => {
      const yourPct = portfolioValue > 0 ? (g.marketValue / portfolioValue) * 100 : 0;
      const stwWeight = pickMap.get(g.underlying)?.stwWeight ?? null;
      const delta = stwWeight !== null ? yourPct - stwWeight : null;
      return { g, yourPct, stwWeight, delta, conviction: pickMap.get(g.underlying)?.conviction ?? g.conviction, declining: decliningSet.has(g.underlying) };
    })
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, trader, portfolioValue, pickMap, decliningSet]);

  // §1 count chips — sizingTone(delta, 1) is the single classifier (±1pt = matched).
  const counts = useMemo(() => {
    let matched = 0, more = 0, less = 0;
    for (const r of rows) {
      const st = sizingTone(r.delta, 1).state;
      if (st === 'oversized') more += 1; else if (st === 'undersized') less += 1; else matched += 1;
    }
    return { matched, more, less };
  }, [rows]);

  // §2 alerts — big-oversize (>3pt heavier than STW).
  const bigOversize = rows.filter((r) => (r.delta ?? 0) > 3);

  const card = overviewCard;
  const chip = (n: number, label: string, role: 'positive' | 'warning' | 'info' | 'neutral') => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: FONT_SIZE.sm, color: `var(--status-${role}-text)`, background: `var(--status-${role}-bg)`, border: `1px solid var(--status-${role}-border)`, borderRadius: 999, padding: '3px 12px' }}>
      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</b> {label}
    </span>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* §1 — summary */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Badge kind="source" trader={trader} />
          <span style={{ fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>
            You tail {trader} on {rows.length} of {groups.length} position{groups.length === 1 ? '' : 's'}
          </span>
        </div>
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginTop: 6 }}>
          Tailing = holding the same stocks {trader} does. Below, each one is compared to how much of <i>their</i> book {trader} puts in it — so you can see where your sizing drifts from theirs.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {chip(counts.matched, 'sized like STW', 'positive')}
          {chip(counts.more, 'you hold more', 'warning')}
          {chip(counts.less, 'you hold less', 'info')}
          {chip(untailed.length, 'your own calls', 'neutral')}
          {exited.length > 0 && chip(exited.length, `${trader} exited`, 'warning')}
        </div>
      </div>

      {/* §2 — alerts */}
      {(decliningTailed.length > 0 || bigOversize.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {decliningTailed.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--status-negative-bg)', border: '1px solid var(--status-negative-border)', borderRadius: 10, padding: '10px 14px' }}>
              <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 999, background: 'var(--status-negative-text)', marginTop: 7 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FONT_SIZE.sms, color: 'var(--text)', lineHeight: 1.5 }}>{trader}&rsquo;s conviction is dropping on {decliningTailed.length} name{decliningTailed.length === 1 ? '' : 's'} you tail</div>
                <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', lineHeight: 1.5 }}>
                  {decliningTailed.map((c, i) => (
                    <span key={c.ticker}>{i > 0 && ', '}<TickerLink ticker={c.ticker} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.sm }} /></span>
                  ))}
                </div>
              </div>
            </div>
          )}
          {bigOversize.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', borderRadius: 10, padding: '10px 14px' }}>
              <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 999, background: 'var(--status-warning-text)', marginTop: 7 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FONT_SIZE.sms, color: 'var(--text)', lineHeight: 1.5 }}>You&rsquo;re much heavier than {trader} on {bigOversize.length} name{bigOversize.length === 1 ? '' : 's'}</div>
                <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', lineHeight: 1.5 }}>
                  {bigOversize.map((r, i) => {
                    const trim = showMoney && portfolioValue > 0 ? ` (trim ≈ ${fmtMoneyCompact((r.delta! / 100) * portfolioValue)})` : '';
                    return <span key={r.g.underlying}>{i > 0 && ', '}<TickerLink ticker={r.g.underlying} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.sm }} /> +{r.delta!.toFixed(1)}pt{trim}</span>;
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* §3 — sizing comparison (diverging bars) */}
      <div style={card}>
        <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)', marginBottom: 2 }}>Your sizing vs {trader}&rsquo;s</div>
        <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.5, marginBottom: 6 }}>
          Bars grow <b style={{ color: 'var(--status-warning-text)' }}>right when you hold more</b> than {trader} and <b style={{ color: 'var(--status-info-text)' }}>left when you hold less</b>. Being different isn&rsquo;t wrong — this just shows you where.
        </div>
        {rows.length === 0 ? (
          <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', padding: '8px 0' }}>No positions currently tail {trader}.</div>
        ) : (
          <>
            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 8px', borderBottom: '1px solid var(--bsub)', fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color: 'var(--t3)' }}>
                <span style={{ width: 64, flexShrink: 0 }}>Stock</span>
                <span style={{ width: 88, flexShrink: 0, textAlign: 'right' }}>You · {trader}</span>
                <span style={{ flex: 1, textAlign: 'center' }}>◂ you hold less&nbsp;&nbsp;|&nbsp;&nbsp;you hold more ▸</span>
                <span style={{ width: 210, flexShrink: 0 }} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map(({ g, yourPct, stwWeight, delta, conviction, declining }) => {
                const tone = sizingTone(delta, 1);
                const overD = tone.state === 'oversized';
                const matchClause = showMoney && delta != null && portfolioValue > 0
                  ? ` — matching them = ${overD ? 'trim' : 'add'} ≈ ${fmtMoney((Math.abs(delta) / 100) * portfolioValue)}`
                  : '';
                const note = delta == null ? '—'
                  : tone.state === 'oversized' ? `${delta.toFixed(1)} points heavier than ${trader}${matchClause}`
                  : tone.state === 'undersized' ? `${Math.abs(delta).toFixed(1)} points lighter than ${trader}${matchClause}`
                  : 'sized like STW (within 1 point)';
                const noteColor = tone.state === 'inline' ? 'var(--t3)' : tone.textVar;
                return (
                  <div key={g.underlying} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bsub)', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    <span style={{ width: 64, flexShrink: 0 }}>
                      <TickerLink ticker={g.underlying} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.sms }} />
                      <ConvictionNote conviction={conviction} declining={declining} />
                    </span>
                    <span style={{ width: 88, flexShrink: 0, textAlign: 'right', fontSize: FONT_SIZE.sm, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      <b>{yourPct.toFixed(1)}%</b> <span style={{ color: 'var(--t3)' }}>· {stwWeight != null ? `${stwWeight.toFixed(1)}%` : '—'}</span>
                    </span>
                    <span style={{ flex: isMobile ? '1 1 120px' : 1 }}><SizingBar delta={delta} /></span>
                    <span style={{ width: isMobile ? '100%' : 210, flexShrink: 0, paddingLeft: isMobile ? 74 : 0, fontSize: FONT_SIZE.xs, color: noteColor, lineHeight: 1.4 }}>{note}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* §4 — your own calls + names STW has exited */}
      {(untailed.length > 0 || exited.length > 0) && (
        <div style={card}>
          {untailed.length > 0 && (
            <>
              <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)', marginBottom: 2 }}>Your own calls</div>
              <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.5, marginBottom: 10 }}>
                You hold these, but no trader you follow tracks them — they&rsquo;re entirely your judgment, so {trader} alerts and conviction changes never cover them.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {untailed.map((g) => {
                  const wt = portfolioValue > 0 ? (g.marketValue / portfolioValue) * 100 : null;
                  return (
                    <button key={g.underlying} onClick={() => onSelectTicker(g.underlying)}
                      style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, background: 'var(--bg)', border: '1px solid var(--bsub)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
                      <span style={{ fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color: 'var(--acc)' }}>{g.underlying}</span>
                      <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
                        {wt != null ? `${wt.toFixed(1)}%` : '—'} of your account{showMoney ? ` · ${fmtMoneyCompact(g.marketValue)}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {exited.length > 0 && (
            <div style={{ marginTop: untailed.length > 0 ? 16 : 0 }}>
              <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)', marginBottom: 2 }}>{trader} has exited — you still hold</div>
              <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.5, marginBottom: 10 }}>
                {trader} once held these but has since closed out (0% of their book). You&rsquo;re on your own here — treat them like your own calls, not a tail.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {exited.map(({ g, yourPct }) => (
                  <button key={g.underlying} onClick={() => onSelectTicker(g.underlying)}
                    style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, background: 'var(--bg)', border: '1px solid var(--bsub)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
                    <span style={{ fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color: 'var(--acc)' }}>{g.underlying}</span>
                    <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
                      {yourPct.toFixed(1)}% of your account{showMoney ? ` · ${fmtMoneyCompact(g.marketValue)}` : ''}
                    </span>
                    <span style={{ fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color: 'var(--status-warning-text)' }}>{trader} out</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* §5 — glossary */}
      <div style={{ ...card, padding: '12px 16px' }}>
        <button onClick={() => setGlossaryOpen((v) => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: FONT_SIZE.xs, padding: 0, textDecoration: 'underline' }}>
          {glossaryOpen ? 'Hide the plain-English glossary' : '? What do these terms mean'}
        </button>
        {glossaryOpen && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: FONT_SIZE.xs, color: 'var(--t2)', lineHeight: 1.7 }}>
            <div><b style={{ color: 'var(--text)' }}>Tailing</b> — you hold the same stock {trader} holds.</div>
            <div><b style={{ color: 'var(--text)' }}>Weight</b> — a position&rsquo;s market value as a % of your whole book.</div>
            <div><b style={{ color: 'var(--text)' }}>Heavier / lighter</b> — your weight vs {trader}&rsquo;s; within ±1 point reads as matched.</div>
            <div><b style={{ color: 'var(--text)' }}>Conviction</b> — {trader}&rsquo;s tier 1–5 for the name; ▼ marks a recent downgrade.</div>
          </div>
        )}
      </div>
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
  // Privacy toggle unified onto the global "Show dollar amounts" pref (usePrivacyStore) —
  // the Profile setting now also controls the portfolio dollars. Replaces the old page-local
  // showPnl useState; the eye button in the header wires straight to the store's toggle.
  const showMoney = usePrivacyStore((s) => s.showMoney);
  const togglePrivacy = usePrivacyStore((s) => s.toggle);
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
    const m = new Map<string, { conviction: number | null; basket: string; traders: string[]; stwWeight: number | null; stwActive: boolean }>();
    for (const h of stwHoldings) {
      // stwActive = STW currently holds it (open, weight > 0). A closed / zero-weight pick means
      // STW has EXITED — you're holding something they dropped, which is not the same as tailing.
      m.set(h.ticker, { conviction: h.conviction ?? null, basket: h.basket ?? '', traders: [FOLLOWED_TRADERS[0]], stwWeight: h.current_weight ?? null, stwActive: h.last_action !== 'Closed' && (h.current_weight ?? 0) > 0 });
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

  // The chosen regime index (default IWM = STW's proxy; user can prefer SPY/QQQ) — drives
  // the Risk-tab market card (rendered inside ViolationsSummary, which sets the store) and
  // the batched 9/21/200 structure + bindingGross computed here. Advisory / display-only.
  const regimeInstrument = useRegimeInstrumentStore((s) => s.instrument);
  const regimeUserId = useAuthStore((s) => s.user?.id);
  const { data: regimeRiskConfig } = useRiskConfig(regimeUserId);
  // Live NLV for the drawdown read (Item 2, Option A) — computed ONCE here from the held
  // positions + the shared Finnhub cache, then threaded into BOTH useBindingGrossTarget
  // (the ladder→gross target) and ViolationsSummary (the card), so the two never read a
  // different NLV. Falls back to the synced ibkr_nlv when quotes aren't cached.
  const liveNlv = useLiveNlv(regimeRiskConfig, positions);
  // Per-stock drawdown ladders (Item 4) — one status per held stock name, off its live
  // drawdown-from-entry, with trim-compliance reconstructed from the fill log. Computed
  // once here; the map feeds both the row chips and the detail-pane section (one source).
  const { data: executions = [] } = useUserExecutions();
  const perStockLadders = usePerStockLadders(positions, executions, regimeRiskConfig);

  // One reconciliation of the drawdown ladder vs the double-RED regime target, computed
  // once here and passed to ViolationsSummary (the invested-bar target marker + the verdict
  // banner) so every risk surface shows the identical binding gross number. The ladder side
  // reads the live NLV so its target tracks the same drawdown the card shows.
  const bindingGross = useBindingGrossTarget(regimeRiskConfig, regimeInstrument, liveNlv.nlv);

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
  // Populate the shared live-price cache for the held book so the Positions list + the
  // detail pane's Current Price read Finnhub, not the stored IBKR mark (same source as
  // Stock Picks — the page just wasn't fetching quotes before).
  useLiveQuotes(portfolioTickers, capabilities.finnhubKey);
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

  // Overview §5 concentration — one source with the Risk verdict: same NLV denominator +
  // classifySeverity thresholds the limits engine uses. Feeds the concentration card AND
  // the attention strip's "over cap" count.
  const sectorCap = regimeRiskConfig?.max_sector_pct ?? 25;
  const sectorRows = useMemo(
    () => computeSectorRows(allGroups, sectorMap, liveNlv.nlv, sectorCap),
    [allGroups, sectorMap, liveNlv.nlv, sectorCap],
  );

  // Risk warnings for the Overview attention strip (Item 3 in-app): account-drawdown state
  // off the SAME live NLV the Risk tab uses (one source of inputs → same verdict), stock
  // names near/past a per-stock stop, and sectors near/over the concentration cap. Advisory —
  // the strip only LINKS to the Risk/Positions detail, never re-runs the math.
  const overviewWarnings = useMemo<OverviewWarnings>(() => {
    const ddPct = regimeRiskConfig
      ? cashflowAdjustedDrawdownPct(liveNlv.nlv, regimeRiskConfig.equity_peak, regimeRiskConfig.cumulative_cashflow, regimeRiskConfig.equity_peak_cashflow)
      : null;
    const ddStatus = ddPct === null || !regimeRiskConfig
      ? null
      : drawdownLadderStatus(regimeRiskConfig.ladder, ddPct, regimeRiskConfig.drawdown_near_band_pp ?? DRAWDOWN_NEAR_BAND_PP);
    const stops = [...perStockLadders.values()];
    return {
      drawdownSeverity: ddStatus && (ddStatus.severity === 'near' || ddStatus.severity === 'breach') ? ddStatus.severity : null,
      drawdownPct: ddStatus ? ddStatus.drawdownPct : null,
      stopAttention: stops.filter((i) => i.status.severity === 'near' || i.status.severity === 'breach').length,
      stopBreach: stops.filter((i) => i.status.severity === 'breach').length,
      capAttention: sectorRows.filter((s) => s.severity === 'near' || s.severity === 'breach').length,
      capBreach: sectorRows.filter((s) => s.severity === 'breach').length,
    };
  }, [regimeRiskConfig, liveNlv.nlv, perStockLadders, sectorRows]);

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
    // Per-stock stop-ladder status. A name with no stock position (option-only) has no
    // stop status, so it's excluded when a stop filter is active — same as structure above.
    if (filters.stop) {
      const sev = perStockLadders.get(underlying)?.status.severity;
      if (filters.stop === 'attention' && sev !== 'near' && sev !== 'breach') return false;
      if (filters.stop === 'breach' && sev !== 'breach') return false;
    }
    if (q && !underlying.toUpperCase().includes(q)) return false;
    return true;
  };
  const dir = filters.sort.endsWith('_asc') ? 1 : -1;
  const nl = (v: number | null) => (v == null ? Number.NEGATIVE_INFINITY : v);
  // Per-stock drawdown-from-entry for the "Stop drawdown" sort. Null (no stock position)
  // sorts to the END regardless of direction, so option-only rows never top the list.
  const ddSort = (underlying: string, asc: boolean) => {
    const v = perStockLadders.get(underlying)?.status.drawdownPct;
    return v == null ? (asc ? Infinity : -Infinity) : v;
  };

  // grouped view rows
  const visibleGroups = useMemo<PortfolioGroup[]>(() => {
    const filtered = allGroups.filter((g) => matchFilters(g.underlying, g.isTailed, g.basket, g.hasOption && !g.hasStock, g.conviction, regimes[g.underlying]));
    return [...filtered].sort((a, b) => {
      switch (filters.sort) {
        case 'pnl_desc': case 'pnl_asc': return (a.netPnl - b.netPnl) * dir;
        case 'ret_desc': case 'ret_asc': return (nl(a.returnPct) - nl(b.returnPct)) * dir;
        case 'value_desc': case 'value_asc': return (a.marketValue - b.marketValue) * dir;
        case 'dd_asc': return ddSort(a.underlying, true) - ddSort(b.underlying, true);
        case 'dd_desc': return ddSort(b.underlying, false) - ddSort(a.underlying, false);
        case 'az': return a.underlying.localeCompare(b.underlying);
        case 'za': return b.underlying.localeCompare(a.underlying);
        default: return 0;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups, filters, regimes, sectorMap, perStockLadders]);

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
        case 'dd_asc': return ddSort(a.underlying, true) - ddSort(b.underlying, true);
        case 'dd_desc': return ddSort(b.underlying, false) - ddSort(a.underlying, false);
        case 'az': return a.underlying.localeCompare(b.underlying) || instrumentLabel(a.p).localeCompare(instrumentLabel(b.p));
        case 'za': return b.underlying.localeCompare(a.underlying) || instrumentLabel(a.p).localeCompare(instrumentLabel(b.p));
        default: return 0;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, pickMap, filters, regimes, sectorMap, perStockLadders]);

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
  const pad = isMobile ? '16px 12px 32px' : '16px 16px 32px';

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
        showPnl={showMoney}
        tickerRegime={regimes[selectedGroup.underlying]}
        perStockLadder={perStockLadders.get(selectedGroup.underlying)}
        perStockLadderConfig={regimeRiskConfig?.per_stock_ladder ?? DEFAULT_PER_STOCK_LADDER}
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
      <button onClick={togglePrivacy} title={showMoney ? 'Hide dollar amounts' : 'Show dollar amounts'}
        style={{ width: 34, height: 34, borderRadius: 6, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border)', color: showMoney ? 'var(--t2)' : 'var(--t3)', cursor: 'pointer', flexShrink: 0 }}>
        {showMoney ? (
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
  const tailedCount = allGroups.filter((g) => g.isTailed).length;
  const overviewBody = (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {syncError && <AlertStrip severity="negative">{syncError}</AlertStrip>}
        {staleSyncWarning && (
          <AlertStrip severity="warning" action={{ label: 'Sync now', onClick: sync }}>
            Last synced {fmtDateTime(lastSynced!)} — numbers below may be stale.
          </AlertStrip>
        )}
        {/* §1–3 hero + attention strip + at-a-glance stats. NLV is the LIVE read (useLiveNlv),
            the same one the Risk tab uses, so the hero can never disagree with the verdict. */}
        <PortfolioSummary
          groups={allGroups}
          showMoney={showMoney}
          nlv={liveNlv.nlv}
          warnings={overviewWarnings}
          sectorCap={sectorCap}
          onOpenRisk={() => changeTab('risk')}
          onOpenStops={() => {
            // Jump to Positions filtered to names near/past a per-stock stop.
            setFilters({ ...DEFAULT_PORTFOLIO_FILTERS, stop: 'attention' });
            changeTab('positions');
          }}
        />
        {/* §4 movers — dollar figures, so gated on the money-visibility pref. */}
        {showMoney && <MoversCard groups={allGroups} portfolioValue={portfolioValue} onOpenPosition={openPosition} />}
        {/* §5 concentration — sector bar + legend always; the treemap is showMoney-gated inside. */}
        <ConcentrationCard sectors={sectorRows} sectorCap={sectorCap} showMoney={showMoney} heatmapCells={heatmapCells} onSelectTicker={openPosition} onOpenRisk={() => changeTab('risk')} />
        {/* §6 tailing footer */}
        <button onClick={() => changeTab('tailing')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: FONT_SIZE.sms, color: 'var(--t2)', lineHeight: 1.5 }}>
            You tail STW on {tailedCount} of {allGroups.length} position{allGroups.length === 1 ? '' : 's'} — see where your sizing drifts from theirs.
          </span>
          <span style={{ flexShrink: 0, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)', whiteSpace: 'nowrap' }}>Tailing tab →</span>
        </button>
      </div>
    </div>
  );

  const riskBody = (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
      {/* Redesigned Risk tab (plans/20260720_webapp_redesign): the verdict banner +
          market health check + the four account-vs-plan cards, all rendered by
          ViolationsSummary from the existing engine/hooks. Max-width 860, centered. */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: pad, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {capabilities.canUseLimits ? (
          <ViolationsSummary
            settingsTo="/settings"
            bindingGross={bindingGross}
            drawdown={{ nlv: liveNlv.nlv, asOf: liveNlv.asOf, isLive: liveNlv.isLive }}
            regimeStructure={regimes[regimeInstrument]}
          />
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>
            <strong style={{ color: 'var(--text)' }}>Risk limits 🔒</strong> — flag concentration and
            gross-exposure breaches in your own book, requires <strong style={{ color: 'var(--t2)' }}>Premium</strong>.
          </div>
        )}
      </div>
    </div>
  );

  const tailingBody = (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad }}>
      <TailingTab groups={allGroups} portfolioValue={portfolioValue} pickMap={pickMap} decliningTailed={decliningTailed} showMoney={showMoney} isMobile={isMobile} onSelectTicker={onSelectTicker} />
    </div>
  );

  const positionsBody = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
      {/* Filter toolbar — scoped to Positions only. The two-row bar owns its own surface. */}
      <PortfolioFilterBar filters={filters} onChange={setFilters} baskets={baskets} sectors={sectors} filtered={visibleCount} total={totalCount} />
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: pad }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '6px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, color: 'var(--t3)' }}>My Portfolio · Positions</span>
            <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginLeft: 'auto' }}>{visibleCount}</span>
          </div>
          {visibleCount === 0 ? (
            <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', padding: '12px 13px' }}>No positions match your filters.</p>
          ) : grouped ? (
            <>
              {!isMobile && showMoney && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, color: 'var(--t3)' }}>
                  <span style={{ width: 8, flexShrink: 0 }} />
                  <span style={{ width: 3, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>Position</span>
                  <span style={{ minWidth: 72, textAlign: 'right', flexShrink: 0 }}>Weight · P&L · Value</span>
                </div>
              )}
              <AccordionList
                items={visibleGroups}
                rowKey={(g) => g.underlying}
                expandedKeys={expanded}
                onToggle={toggleGroup}
                accentColor={(g) => (g.conviction !== null ? (TIERS[g.conviction]?.color ?? 'var(--border)') : 'var(--border)')}
                renderHeader={(g) => (
                  <GroupHeader group={g} onSelectTicker={onSelectTicker} showMoney={showMoney} isMobile={isMobile} portfolioValue={portfolioValue} maxWeight={Math.max(1, ...visibleGroups.map((x) => portfolioValue > 0 ? (x.marketValue / portfolioValue) * 100 : 0))} regime={regimes[g.underlying]} ladderInfo={perStockLadders.get(g.underlying)} />
                )}
                renderExpanded={(g) => (
                  <>
                    <PositionMetrics group={g} portfolioValue={portfolioValue} showMoney={showMoney} />
                    {g.positions.map((p) => <LegRow key={p.id} pos={p} showMoney={showMoney} />)}
                  </>
                )}
              />
            </>
          ) : (
            <FlatTable rows={visibleLegs} onSelectTicker={onSelectTicker} showMoney={showMoney} isMobile={isMobile} portfolioValue={portfolioValue} regimes={regimes} perStockLadders={perStockLadders} />
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
