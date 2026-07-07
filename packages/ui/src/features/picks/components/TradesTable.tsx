import { useState, useMemo } from 'react';
import { fmtLegInstrument, legIsOpen, legUnrealizedPnlPct, type Direction } from '@stw/shared';
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
      // (initial lot − what's still open). Mirrors closedPnlContribution, per leg.
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
function applyTradeFilters(rows: TradeRow[], f: TradesFilters): TradeRow[] {
  const q = f.search.trim().toUpperCase();
  const out = rows.filter((r) => {
    if (f.openClosed === 'open' && !r.isOpen) return false;
    if (f.openClosed === 'closed' && r.isOpen) return false;
    if (f.type === 'shares' && r.instrumentType !== 'SHARES') return false;
    if (f.type === 'options' && r.instrumentType !== 'OPTION') return false;
    if (f.basket && r.holding.basket !== f.basket) return false;
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
    case 'opened_desc':
    default:            out.sort(byDate('openDate', -1)); // newest opened first (the default)
  }
  return out;
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--t3)', background: 'var(--s2)',
  padding: '7px 13px', borderBottom: '1px solid var(--bsub)', whiteSpace: 'nowrap',
};
const thR: React.CSSProperties = { ...th, textAlign: 'right' };

function pnlCell(v: number | null) {
  if (v == null) return { text: '—', color: 'var(--t3)' };
  return { text: `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, color: v >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)' };
}
const money = (v: number | null) => (v != null ? `$${v.toFixed(2)}` : '—');
const days = (v: number | null) => (v != null ? `${v}d` : '—');
const wt = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : '—');

interface Props {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

// Trade blotter — one row per leg (share lot or option leg). Open Price is the leg's
// entry_price; open legs show live (unrealized) %-P&L, closed show the leg's realized %.
export function TradesTable({ holdings, onSelectTicker }: Props) {
  const { canEdit } = useCapabilities();
  const priceCache = usePriceCacheStore((s) => s.cache);
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState<Holding | null>(null);

  const filters = useTradesFiltersStore();
  const allTrades = useMemo(() => buildTrades(holdings, priceCache), [holdings, priceCache]);
  const trades = useMemo(() => applyTradeFilters(allTrades, filters), [allTrades, filters]);
  const today = new Date().toISOString().slice(0, 10);

  // Column visibility follows the Open/Closed/All toggle so each view only shows columns that
  // apply. Open-only columns (Current P&L, Days Open) are noise once everything is closed; closed-only
  // columns (Closed date, Close price, realized P&L, Contribution, Duration) are noise while open.
  const showOpenCols   = filters.openClosed !== 'closed'; // open or all
  const showClosedCols = filters.openClosed !== 'open';   // closed or all

  const td: React.CSSProperties = {
    padding: '9px 13px', borderBottom: '1px solid var(--bsub)',
    verticalAlign: 'middle', lineHeight: 1.4, whiteSpace: 'nowrap',
  };
  const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  // Closed-trade contribution cell: portfolio impact in weight points (return × sold weight).
  function contribCell(v: number | null) {
    if (v == null) return { text: '—', color: 'var(--t3)' };
    return { text: `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, color: v >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)' };
  }

  return (
    // Column layout: a full-bleed filter bar (matches the Ticker Details FilterBar) above a padded,
    // scrollable area holding the table card — so the Trades tab reads as the same app as Ticker Details.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {editing && <TradeEditForm holding={editing} onDone={() => setEditing(null)} />}

      <TradesFilterBar holdings={holdings} count={trades.length} total={allTrades.length} />

      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 12px' : '20px 24px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>📈 Trades</span>
          {trades.length > 0 && <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>{trades.length}</span>}
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: 9 }}>
          {trades.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--t3)', padding: '12px 13px' }}>
              {allTrades.length === 0 ? 'No trades yet.' : 'No trades match your filters.'}
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={th}>Ticker</th>
                  {!isMobile && <th style={th}>Opened</th>}
                  <th style={thR}>Open</th>
                  {!isMobile && <th style={thR}>Init Wt</th>}
                  {!isMobile && showClosedCols && <th style={th}>Closed</th>}
                  {!isMobile && showClosedCols && <th style={thR}>Close</th>}
                  <th style={th}>Type</th>
                  {showOpenCols && <th style={thR}>Current P&amp;L</th>}
                  {showClosedCols && <th style={thR}>P&amp;L</th>}
                  {!isMobile && showClosedCols && <th style={thR}>Contribution</th>}
                  {!isMobile && showOpenCols && <th style={thR}>Days Open</th>}
                  {!isMobile && showClosedCols && <th style={thR}>Duration</th>}
                  {canEdit && <th style={thR}></th>}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const cur = pnlCell(t.currentPnl);
                  const real = t.exercised
                    ? { text: 'Exercised', color: 'var(--t2)' }
                    : pnlCell(t.realizedPnl);
                  const contrib = contribCell(t.contribution);
                  return (
                    <tr key={t.key}>
                      <td style={td}>
                        <TickerLink ticker={t.holding.ticker} onSelect={onSelectTicker} />
                        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{t.instrument}</div>
                      </td>
                      {!isMobile && <td style={{ ...td, color: 'var(--t2)' }}>{fmtTradeDate(t.openDate)}</td>}
                      <td style={{ ...tdR, color: 'var(--t2)' }}>{money(t.openPrice)}</td>
                      {!isMobile && <td style={{ ...tdR, color: 'var(--t2)' }}>{wt(t.initialWeight)}</td>}
                      {!isMobile && showClosedCols && <td style={{ ...td, color: t.isOpen ? 'var(--t3)' : 'var(--t2)' }}>{t.isOpen ? '—' : fmtTradeDate(t.closeDate)}</td>}
                      {!isMobile && showClosedCols && <td style={{ ...tdR, color: 'var(--t2)' }}>{money(t.closePrice)}</td>}
                      <td style={{ ...td, color: 'var(--t2)', textTransform: 'capitalize' }}>{t.direction}</td>
                      {showOpenCols && <td style={{ ...tdR, color: cur.color, fontWeight: 600 }}>{cur.text}</td>}
                      {showClosedCols && <td style={{ ...tdR, color: real.color, fontWeight: 600 }}>{real.text}</td>}
                      {!isMobile && showClosedCols && <td style={{ ...tdR, color: contrib.color, fontWeight: 600 }}>{contrib.text}</td>}
                      {!isMobile && showOpenCols && <td style={{ ...tdR, color: 'var(--t3)' }}>{days(t.isOpen ? daysBetween(t.openDate, today) : null)}</td>}
                      {!isMobile && showClosedCols && <td style={{ ...tdR, color: 'var(--t3)' }}>{days(t.isOpen ? null : daysBetween(t.openDate, t.closeDate))}</td>}
                      {canEdit && (
                        <td style={tdR}>
                          <button
                            onClick={() => setEditing(t.holding)}
                            title="Edit trade"
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--t2)', fontSize: 11, padding: '2px 8px' }}
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
