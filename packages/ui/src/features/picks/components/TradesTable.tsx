import { useMemo, useState } from 'react';
import { fmtLegInstrument, legIsOpen, legUnrealizedPnlPct, matchConvictionBand, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, SPACE, type Direction } from '@stw/shared';
import { useSectorMap } from '../../limits/useRiskConfig';
import { TradeEditForm } from './TradeEditForm';
import { TradesFilterBar } from './TradesFilterBar';
import { TickerLink } from '../../../primitives/TickerLink';
import { usePriceCacheStore, type Quote } from '../../../store/priceCache';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useTradesFiltersStore, type TradesFilters, type TradeSort } from '../useTradesFilters';
import type { Holding } from '../api';

const TODAY = new Date().toISOString().slice(0, 10);

function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// Date-only display for a trade open/close date (no time component — an allowed fmtDateTime
// exception, like action_date). Accepts a bare 'YYYY-MM-DD' or a full timestamp.
function fmtTradeDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

type TradeAction = 'New' | 'Close' | 'Expired';
// Action colors mirror the ref's ACT_C (New = accent green, Close = muted, Expired = negative).
const ACTION_COLOR: Record<TradeAction, string> = {
  New: 'var(--acc)', Close: 'var(--t3)', Expired: 'var(--status-negative-text)',
};

// One trade row per leg (share lot or option leg). Open legs show live (unrealized) %-P&L;
// closed legs show their booked realized %; exercised legs carry no P&L (value moved to the
// spawned shares leg).
interface TradeRow {
  key: string;
  holding: Holding;
  instrument: string;       // "Common" or "$7.5C Jul '26"
  instrumentType: 'SHARES' | 'OPTION';
  action: TradeAction;      // lot lifecycle, derived from the leg's own state
  openPrice: number | null; // leg entry_price
  closePrice: number | null;
  initialWeight: number | null; // leg's entry lot (portfolio weight %)
  currentPnl: number | null;
  realizedPnl: number | null;
  contribution: number | null; // closed-only: realized% × weight sold (portfolio contribution, in pts)
  exercised: boolean;
  direction: Direction;
  isOpen: boolean;
  openDate: string | null;
  closeDate: string | null;
}

function buildTrades(holdings: Holding[], cache: Record<string, Quote>): TradeRow[] {
  const rows: TradeRow[] = [];
  for (const h of holdings) {
    if (h.ticker === 'CASH') continue;
    const live = cache[h.ticker]?.c ?? null;
    for (const leg of h.legs) {
      const isOpen = legIsOpen(leg);
      const exercised = leg.status === 'EXERCISED';
      // Portfolio contribution of a closed/trimmed leg: realized % × the weight actually sold
      // (initial lot − what's still open). Mirrors closedPnlContribution, per leg. LOCKED model.
      const sold = (leg.initial_weight ?? 0) - (leg.weight ?? 0);
      const contribution = !isOpen && leg.realized_pnl_pct != null && sold > 0
        ? Math.round((leg.realized_pnl_pct / 100) * sold * 100) / 100
        : null;
      // Lot action from the leg's own state. Add/Trim/Roll are position-narrative verbs that
      // don't exist at the leg grain, so we surface only what a single leg can prove.
      const expired = leg.close_reason === 'EXPIRED_WORTHLESS' || (leg.instrument_type === 'OPTION' && leg.exit_price === 0);
      const action: TradeAction = isOpen ? 'New' : (expired ? 'Expired' : 'Close');
      rows.push({
        key: leg.id,
        holding: h,
        instrument: fmtLegInstrument(leg),
        instrumentType: leg.instrument_type,
        action,
        openPrice: leg.entry_price,
        closePrice: leg.exit_price ?? null,
        initialWeight: leg.initial_weight ?? null,
        currentPnl: isOpen ? legUnrealizedPnlPct(leg, live) : null,
        realizedPnl: isOpen ? null : leg.realized_pnl_pct,
        contribution,
        exercised,
        direction: leg.direction,
        isOpen,
        openDate: leg.opened_at ?? h.action_date,
        closeDate: leg.closed_at ?? null,
      });
    }
  }
  return rows;
}

// Days a lot has been (or was) held — open counts to today; closed counts to its close date.
function rowDays(r: TradeRow): number | null {
  return r.isOpen ? daysBetween(r.openDate, TODAY) : daysBetween(r.openDate, r.closeDate);
}

// Apply the Trades-tab filters + sort to the built rows. Kept pure so it's trivially testable.
// `sectorMap` (ticker → GICS sector) is threaded in because sector isn't on the leg/holding.
function applyTradeFilters(rows: TradeRow[], f: TradesFilters, sectorMap: Record<string, string>): TradeRow[] {
  const q = f.search.trim().toUpperCase();
  const out = rows.filter((r) => {
    if (f.openClosed === 'open' && !r.isOpen) return false;
    if (f.openClosed === 'closed' && r.isOpen) return false;
    if (f.type === 'shares' && r.instrumentType !== 'SHARES') return false;
    if (f.type === 'options' && r.instrumentType !== 'OPTION') return false;
    if (f.basket && r.holding.basket !== f.basket) return false;
    if (!matchConvictionBand(r.holding.conviction ?? null, f.conviction)) return false;
    if (f.sector && (sectorMap[r.holding.ticker] ?? '') !== f.sector) return false;
    if (f.action && r.action !== f.action) return false;
    if (q && !(r.holding.ticker.toUpperCase().includes(q) || r.instrument.toUpperCase().includes(q))) return false;
    return true;
  });

  // Effective P&L for sorting: open → live unrealized; closed → booked realized.
  const effPnl = (r: TradeRow) => (r.isOpen ? r.currentPnl : r.realizedPnl);
  const byTicker = (a: TradeRow, b: TradeRow) =>
    a.holding.ticker !== b.holding.ticker
      ? (a.holding.ticker < b.holding.ticker ? -1 : 1)
      : (a.instrument < b.instrument ? -1 : 1);
  const nullsLast = (v: number | null) => (v == null ? Number.NEGATIVE_INFINITY : v);
  const time = (s: string | null) => (s ? (new Date(s).getTime() || null) : null);
  // Date comparator that always sinks rows with no date to the bottom (regardless of direction).
  const byDate = (get: (r: TradeRow) => string | null, dir: 1 | -1) => (a: TradeRow, b: TradeRow) => {
    const av = time(get(a)); const bv = time(get(b));
    if (av == null && bv == null) return byTicker(a, b);
    if (av == null) return 1;
    if (bv == null) return -1;
    return av === bv ? byTicker(a, b) : dir * (av - bv);
  };
  const lastAction = (r: TradeRow) => r.closeDate ?? r.openDate; // most recent event on the lot

  switch (f.sort) {
    case 'new': out.sort(byDate((r) => r.openDate, -1)); break;
    case 'old': out.sort(byDate((r) => r.openDate, 1)); break;
    case 'pnlD': out.sort((a, b) => nullsLast(effPnl(b)) - nullsLast(effPnl(a))); break;
    case 'pnlU': out.sort((a, b) => nullsLast(effPnl(a)) - nullsLast(effPnl(b))); break;
    case 'wtD': out.sort((a, b) => nullsLast(b.initialWeight) - nullsLast(a.initialWeight) || byTicker(a, b)); break;
    case 'az': out.sort(byTicker); break;
    case 'last':
    default: out.sort(byDate(lastAction, -1)); // last action, newest first (the default)
  }
  return out;
}

const money = (v: number | null) => (v != null ? `$${v.toFixed(2)}` : '—');
const wt = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : '—');
const pnlColor = (v: number | null) => (v == null ? 'var(--t3)' : v >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)');
const pnlText = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
const pctSigned = (v: number, d: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`;

// The 14 (or 15 w/ Edit) column widths — two minmax(20px,1fr) rules ARE the vertical dividers,
// which absorb the slack so the grid fills the pane while the min-width forces a scroll.
const GRID = '20px minmax(100px,220px) 56px 84px 56px 50px minmax(20px,1fr) 84px 56px 40px minmax(20px,1fr) 92px 92px 54px';
const headBase: React.CSSProperties = {
  fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.07em',
  textTransform: 'uppercase', whiteSpace: 'nowrap',
};
const vRule: React.CSSProperties = { justifySelf: 'center', width: 1, height: 26, background: 'var(--bsub)' };

interface StatCard { label: string; value: string; sub: string; color: string; }
function buildStats(rows: TradeRow[]): StatCard[] {
  const open = rows.filter((r) => r.isOpen);
  const closed = rows.filter((r) => !r.isOpen);
  const openOpts = open.filter((r) => r.instrumentType === 'OPTION').length;
  const wins = closed.filter((r) => (r.realizedPnl ?? 0) > 0).length;
  const booked = closed.reduce((a, r) => a + (r.contribution ?? 0), 0);
  const avg = (arr: TradeRow[]) => (arr.length ? Math.round(arr.reduce((a, r) => a + (rowDays(r) ?? 0), 0) / arr.length) : 0);
  const winRate = closed.length ? Math.round((wins / closed.length) * 100) : 0;
  return [
    { label: 'Open lots', value: String(open.length), sub: `${openOpts} option${openOpts === 1 ? '' : 's'}`, color: 'var(--text)' },
    { label: 'Closed lots', value: String(closed.length), sub: 'since inception', color: 'var(--text)' },
    { label: 'Booked contribution', value: pctSigned(booked, 2), sub: 'to the whole book', color: booked >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)' },
    { label: 'Win rate (closed)', value: `${winRate}%`, sub: `${wins} of ${closed.length} booked green`, color: 'var(--text)' },
    { label: 'Avg hold (closed)', value: `${avg(closed)}d`, sub: `open lots avg ${avg(open)}d`, color: 'var(--text)' },
  ];
}

interface Props {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

// Transactions blotter — one flat row per lot (share lot or option leg), matching the
// redesigned Trades screen: five summary stat cards over a wide, horizontally-scrollable
// grid split into Opened | Closed | Result column groups by vertical rules.
export function TradesTable({ holdings, onSelectTicker }: Props) {
  const { canEdit } = useCapabilities();
  const priceCache = usePriceCacheStore((s) => s.cache);
  const [editing, setEditing] = useState<Holding | null>(null);

  const filters = useTradesFiltersStore();
  const { sort, setSort, reset } = filters;
  const { data: sectorMap = {} } = useSectorMap();
  const allTrades = useMemo(() => buildTrades(holdings, priceCache), [holdings, priceCache]);
  const trades = useMemo(() => applyTradeFilters(allTrades, filters, sectorMap), [allTrades, filters, sectorMap]);
  const sectorOptions = useMemo(
    () => [...new Set(holdings.map((h) => sectorMap[h.ticker]).filter((s): s is string => !!s))].sort(),
    [holdings, sectorMap],
  );
  const stats = useMemo(() => buildStats(allTrades), [allTrades]);

  const gridCols = canEdit ? `${GRID} 44px` : GRID;

  // A sortable/plain column head. `desc`/`asc` are the sort keys it drives; a two-key head
  // toggles between them, a one-key head just applies it.
  const head = (label: string, align: 'left' | 'right', desc?: TradeSort, asc?: TradeSort) => {
    const active = sort === desc || sort === asc;
    const style: React.CSSProperties = { ...headBase, color: active ? 'var(--acc)' : 'var(--t3)', textAlign: align };
    if (!desc && !asc) return <span style={style}>{label}</span>;
    const arrow = active ? (sort === asc ? ' ↑' : ' ↓') : '';
    const onClick = () => setSort(desc && asc ? (sort === desc ? asc : desc) : (desc ?? asc)!);
    return (
      <button onClick={onClick} style={{ ...style, background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%' }}>
        {label}{arrow}
      </button>
    );
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg)' }}>
      {editing && <TradeEditForm holding={editing} onDone={() => setEditing(null)} />}

      {/* Full-bleed filter rows (dropdowns + segmented Show/Type), same chrome as Ticker Details. */}
      <TradesFilterBar holdings={holdings} sectors={sectorOptions} count={trades.length} total={allTrades.length} />

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '16px 16px 40px' }}>
        {/* Summary stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color: 'var(--t3)' }}>{s.label}</div>
              <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, marginTop: 2, fontVariantNumeric: 'tabular-nums', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 1 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Blotter card */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: `${SPACE[1.5]}px ${SPACE[3.5]}px`, background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color: 'var(--t3)' }}>
            Stock Picks · Trades
          </div>

          {trades.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t2)' }}>
                {allTrades.length === 0 ? 'No trades yet.' : 'No lots match these filters'}
              </div>
              {allTrades.length > 0 && (
                <button onClick={reset} style={{ marginTop: 10, padding: '6px 14px', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--acc)', cursor: 'pointer' }}>
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ minWidth: canEdit ? 1020 : 976 }}>
                {/* Sticky column header */}
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, alignItems: 'center', padding: '7px 14px', borderBottom: '1px solid var(--bsub)', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 2 }}>
                  <span />
                  {head('Ticker', 'left', undefined, 'az')}
                  {head('Action', 'left')}
                  {head('Opened', 'left', 'new', 'old')}
                  {head('Open', 'right')}
                  {head('Init Wt', 'right', 'wtD')}
                  <span />
                  {head('Closed', 'left', 'last')}
                  {head('Close', 'right')}
                  {head('Type', 'left')}
                  <span />
                  {head('P&L', 'right', 'pnlD', 'pnlU')}
                  {head('Contribution', 'right')}
                  {head('Days', 'right')}
                  {canEdit && <span />}
                </div>

                {trades.map((r) => {
                  const pnl = r.isOpen ? r.currentPnl : r.realizedPnl;
                  const days = rowDays(r);
                  return (
                    <div key={r.key} title={r.instrument} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--bsub)', fontVariantNumeric: 'tabular-nums' }}>
                      <span title={r.isOpen ? 'Open — live P&L' : 'Closed — booked'} style={{ width: 8, height: 8, borderRadius: '50%', background: r.isOpen ? 'var(--acc)' : 'var(--border)', justifySelf: 'center' }} />
                      <span style={{ minWidth: 0 }}>
                        <TickerLink ticker={r.holding.ticker} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.sms }} />
                        <span style={{ display: 'block', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.instrumentType === 'SHARES' ? 'Shares' : r.instrument}
                        </span>
                      </span>
                      <span style={{ fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.05em', textTransform: 'uppercase', color: ACTION_COLOR[r.action] }}>{r.action}</span>
                      <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', whiteSpace: 'nowrap' }}>{fmtTradeDate(r.openDate)}</span>
                      <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', textAlign: 'right', whiteSpace: 'nowrap' }}>{money(r.openPrice)}</span>
                      <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', textAlign: 'right' }}>{wt(r.initialWeight)}</span>
                      <span style={vRule} />
                      <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', whiteSpace: 'nowrap' }}>{r.isOpen ? '—' : fmtTradeDate(r.closeDate)}</span>
                      <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.isOpen ? '—' : money(r.closePrice)}</span>
                      <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)' }}>{r.direction === 'short' ? 'Short' : 'Long'}</span>
                      <span style={vRule} />
                      <span style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: r.exercised ? 'var(--t2)' : pnlColor(pnl) }}>{r.exercised ? 'Exercised' : pnlText(pnl)}</span>
                        <span style={{ display: 'block', fontSize: FONT_SIZE['3xs'], color: 'var(--t3)' }}>{r.exercised ? 'exercised' : r.isOpen ? 'live' : 'booked'}</span>
                      </span>
                      <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, textAlign: 'right', color: r.isOpen ? 'var(--t3)' : pnlColor(r.contribution) }}>
                        {r.isOpen || r.contribution == null ? '—' : pctSigned(r.contribution, 2)}
                      </span>
                      <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', textAlign: 'right' }}>{days != null ? `${days}d` : '—'}</span>
                      {canEdit && (
                        <span style={{ textAlign: 'right' }}>
                          <button onClick={() => setEditing(r.holding)} title="Edit trade" style={{ padding: '3px 9px', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t2)', cursor: 'pointer' }}>Edit</button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ padding: '8px 14px', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.5 }}>
            One row per lot. Green dot = open (live P&amp;L, days so far); gray dot = closed (booked P&amp;L, contribution to the whole book, days held).
          </div>
        </div>
      </div>
    </div>
  );
}
