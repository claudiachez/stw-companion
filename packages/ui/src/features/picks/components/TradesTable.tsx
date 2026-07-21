import { useState, useMemo } from 'react';
import { fmtLegInstrument, legIsOpen, legUnrealizedPnlPct, matchConvictionBand, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACE, type Direction } from '@stw/shared';
import { useSectorMap } from '../../limits/useRiskConfig';
import { TradeEditForm } from './TradeEditForm';
import { TradesFilterBar } from './TradesFilterBar';
import { TickerLink } from '../../../primitives/TickerLink';
import { usePriceCacheStore, type Quote } from '../../../store/priceCache';
import { useCapabilities } from '../../../context/AppCapabilities';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useTradesFiltersStore, type TradesFilters } from '../useTradesFilters';
import type { Holding } from '../api';

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

// One trade row per leg (share lot or option leg). Open legs show live (unrealized) %-P&L;
// closed legs show their booked realized %; exercised legs carry no P&L (value moved to the
// spawned shares leg).
interface TradeRow {
  key: string;
  holding: Holding;
  instrument: string;       // "Common" or "$7.5C Jul '26"
  instrumentType: 'SHARES' | 'OPTION';
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
      rows.push({
        key: leg.id,
        holding: h,
        instrument: fmtLegInstrument(leg),
        instrumentType: leg.instrument_type,
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
  // Date comparator that always sinks rows with no date to the bottom (regardless of direction) —
  // e.g. open legs have no close date, so "Closed newest/oldest" lists the dated rows first.
  const byDate = (field: 'openDate' | 'closeDate', dir: 1 | -1) => (a: TradeRow, b: TradeRow) => {
    const av = a[field] ? new Date(a[field]!).getTime() || null : null;
    const bv = b[field] ? new Date(b[field]!).getTime() || null : null;
    if (av == null && bv == null) return byTicker(a, b);
    if (av == null) return 1;
    if (bv == null) return -1;
    return av === bv ? byTicker(a, b) : dir * (av - bv);
  };

  switch (f.sort) {
    case 'pnl_desc':    out.sort((a, b) => nullsLast(effPnl(b)) - nullsLast(effPnl(a))); break;
    case 'pnl_asc':     out.sort((a, b) => nullsLast(effPnl(a)) - nullsLast(effPnl(b))); break;
    case 'opened_asc':  out.sort(byDate('openDate', 1)); break;
    case 'closed_desc': out.sort(byDate('closeDate', -1)); break;
    case 'closed_asc':  out.sort(byDate('closeDate', 1)); break;
    case 'az':          out.sort(byTicker); break;
    case 'za':          out.sort((a, b) => byTicker(b, a)); break;
    case 'conviction':  out.sort((a, b) => (nullsLast(b.holding.conviction ?? null) - nullsLast(a.holding.conviction ?? null)) || byTicker(a, b)); break;
    case 'opened_desc':
    default:            out.sort(byDate('openDate', -1)); // newest opened first (the default)
  }
  return out;
}

const money = (v: number | null) => (v != null ? `$${v.toFixed(2)}` : '—');
const wt = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : '—');
const pnlColor = (v: number | null) => (v == null ? 'var(--t3)' : v >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)');
const pnlText = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);

interface Props {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

// One blotter row per lot. Left = ticker (13px) + instrument sub-line; middle = the story
// line (open vs closed phrasing); right = P&L% + a "live" / "booked · ±N pts" sub-line.
function LotRow({ t, isMobile, canEdit, onSelectTicker, onEdit }: {
  t: TradeRow; isMobile: boolean; canEdit: boolean;
  onSelectTicker?: (ticker: string) => void; onEdit: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const pnl = t.isOpen ? t.currentPnl : t.realizedPnl;

  const instrumentSub = t.instrumentType === 'SHARES' ? 'Shares' : t.instrument;

  // Story line — the plain-English lifecycle of the lot.
  const story = t.isOpen
    ? <>Opened {fmtTradeDate(t.openDate)} @ {money(t.openPrice)} · {wt(t.initialWeight)} of the book · open {daysBetween(t.openDate, today) ?? '—'} days</>
    : <>{fmtTradeDate(t.openDate)} @ {money(t.openPrice)} → {fmtTradeDate(t.closeDate)} @ {money(t.closePrice)} · {wt(t.initialWeight)} lot · held {daysBetween(t.openDate, t.closeDate) ?? '—'} days</>;

  // Right sub-line — how the % should be read.
  const rightSub = t.exercised
    ? 'exercised'
    : t.isOpen
      ? 'live'
      : t.contribution != null
        ? `booked · ${t.contribution >= 0 ? '+' : ''}${t.contribution.toFixed(2)} pts to the book`
        : 'booked';

  const ticker = <TickerLink ticker={t.holding.ticker} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.sms }} />;
  const instrument = (
    <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {instrumentSub}
    </div>
  );
  const right = (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <div style={{ fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color: t.exercised ? 'var(--t2)' : pnlColor(pnl), fontVariantNumeric: 'tabular-nums' }}>
        {t.exercised ? 'Exercised' : pnlText(pnl)}
      </div>
      <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 1 }}>{rightSub}</div>
    </div>
  );
  const editBtn = canEdit ? (
    <button
      onClick={onEdit}
      title="Edit trade"
      style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border)', borderRadius: RADIUS.DEFAULT, cursor: 'pointer', color: 'var(--t2)', fontSize: FONT_SIZE['2xs'], padding: '2px 7px' }}
    >
      Edit
    </button>
  ) : null;

  return (
    <div style={{
      padding: `${SPACE[2.5]}px ${SPACE[3]}px`, borderBottom: '1px solid var(--bsub)',
      opacity: t.isOpen ? 1 : 0.65,
    }}>
      {isMobile ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE[2] }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div>{ticker}</div>
              {instrument}
            </div>
            {right}
            {editBtn}
          </div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', marginTop: SPACE[1.5], lineHeight: 1.5 }}>{story}</div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[3] }}>
          <div style={{ width: 96, flexShrink: 0, minWidth: 0 }}>
            <div>{ticker}</div>
            {instrument}
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: FONT_SIZE.xs, color: 'var(--t2)', lineHeight: 1.5 }}>{story}</div>
          <div style={{ width: 128, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: SPACE[2], flexShrink: 0 }}>
            {right}
            {editBtn}
          </div>
        </div>
      )}
    </div>
  );
}

// Transactions blotter — one row per lot (share lot or option leg). Open legs show live
// (unrealized) %-P&L; closed legs show the booked realized % and its portfolio contribution.
export function TradesTable({ holdings, onSelectTicker }: Props) {
  const { canEdit } = useCapabilities();
  const priceCache = usePriceCacheStore((s) => s.cache);
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState<Holding | null>(null);

  const filters = useTradesFiltersStore();
  const { data: sectorMap = {} } = useSectorMap();
  const allTrades = useMemo(() => buildTrades(holdings, priceCache), [holdings, priceCache]);
  const trades = useMemo(() => applyTradeFilters(allTrades, filters, sectorMap), [allTrades, filters, sectorMap]);
  const sectorOptions = useMemo(
    () => [...new Set(holdings.map((h) => sectorMap[h.ticker]).filter((s): s is string => !!s))].sort(),
    [holdings, sectorMap],
  );

  return (
    // Full-bleed eyebrow + filter bar above a padded, scrollable area holding the lot list —
    // so the Transactions tab reads as the same app as Ticker Details.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {editing && <TradeEditForm holding={editing} onDone={() => setEditing(null)} />}

      {/* Eyebrow strip — names the surface (shared anatomy with DetailPane). */}
      <div style={{
        background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', flexShrink: 0,
        padding: `${SPACE[1.5]}px ${SPACE[3.5]}px`,
        fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label,
        textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        Stock Picks · Transactions
      </div>

      <TradesFilterBar holdings={holdings} sectors={sectorOptions} count={trades.length} total={allTrades.length} />

      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 12px' : '20px 24px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.lg, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
          {trades.length === 0 ? (
            <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', padding: `${SPACE[3]}px ${SPACE[3]}px` }}>
              {allTrades.length === 0 ? 'No trades yet.' : 'No trades match your filters.'}
            </p>
          ) : (
            trades.map((t) => (
              <LotRow
                key={t.key}
                t={t}
                isMobile={isMobile}
                canEdit={canEdit}
                onSelectTicker={onSelectTicker}
                onEdit={() => setEditing(t.holding)}
              />
            ))
          )}
        </div>

        {/* Footer note — how to read the two row states. */}
        <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: SPACE[2.5], lineHeight: 1.5 }}>
          One row per lot. Open rows show live P&amp;L; closed rows show what was booked and its contribution to the whole book.
        </p>
      </div>
    </div>
  );
}
