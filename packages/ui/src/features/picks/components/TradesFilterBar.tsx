import type { Holding } from '../api';
import { useTradesFiltersStore, type TradeOpenClosed, type TradeSort, type TradeType } from '../useTradesFilters';

const SORT_OPTIONS: { value: TradeSort; label: string }[] = [
  { value: 'opened_desc', label: 'Sort: Opened newest' },
  { value: 'opened_asc',  label: 'Sort: Opened oldest' },
  { value: 'closed_desc', label: 'Sort: Closed newest' },
  { value: 'closed_asc',  label: 'Sort: Closed oldest' },
  { value: 'pnl_desc',    label: 'Sort: P&L ↓' },
  { value: 'pnl_asc',     label: 'Sort: P&L ↑' },
  { value: 'az',          label: 'Sort: A → Z' },
  { value: 'za',          label: 'Sort: Z → A' },
];

const OPEN_CLOSED: { value: TradeOpenClosed; label: string }[] = [
  { value: 'open',   label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all',    label: 'All' },
];

// Shares the FilterBar control styling so the two tabs read as one app.
const ctrlStyle: React.CSSProperties = {
  height: 34, padding: '0 8px', fontSize: 12, borderRadius: 5,
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
  cursor: 'pointer', outline: 'none', flexShrink: 0,
};

interface Props {
  holdings: Holding[];
  /** rows matching the current filter / total candidate rows — shown as "N of M". */
  count: number;
  total: number;
}

// Filter bar for the Trades blotter. Deliberately mirrors the Ticker Details FilterBar chrome
// (full-bleed surface bar, same control style, "All Baskets" wording, horizontal scroll — no wrap)
// so the two tabs stay visually consistent. The status axis is an Open/Closed/All toggle (the
// leg's own state) and Type is Shares/Options only.
export function TradesFilterBar({ holdings, count, total }: Props) {
  const { search, basket, type, openClosed, sort, setSearch, setBasket, setType, setOpenClosed, setSort, reset } =
    useTradesFiltersStore();

  const baskets = [...new Set(holdings.map((h) => h.basket).filter(Boolean))].sort();
  const hasFilter = !!search || !!basket || !!type || openClosed !== 'all';

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', minWidth: 'max-content' }}>

        {/* Open / Closed / All segmented toggle (replaces the position-level status dropdown) */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden', flexShrink: 0, height: 34 }}>
          {OPEN_CLOSED.map((o) => (
            <button
              key={o.value}
              onClick={() => setOpenClosed(o.value)}
              style={{
                padding: '0 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                background: openClosed === o.value ? 'var(--acc)' : 'var(--bg)',
                color: openClosed === o.value ? 'var(--text-inverse)' : 'var(--t2)',
                fontWeight: openClosed === o.value ? 600 : 400,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker…"
          style={{ ...ctrlStyle, width: 120, cursor: 'text' }}
        />

        <select value={basket} onChange={(e) => setBasket(e.target.value)} style={ctrlStyle}>
          <option value="">All Baskets</option>
          {baskets.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        <select value={type} onChange={(e) => setType(e.target.value as TradeType)} style={ctrlStyle}>
          <option value="">All Types</option>
          <option value="shares">Shares</option>
          <option value="options">Options</option>
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value as TradeSort)} style={ctrlStyle}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {hasFilter && (
          <button
            onClick={reset}
            style={{ ...ctrlStyle, border: 'none', background: 'none', color: 'var(--t3)', padding: '0 4px' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
          >
            Clear
          </button>
        )}

        <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 4, whiteSpace: 'nowrap' }}>
          {count < total ? `${count} of ${total}` : `${total} trade${total === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  );
}
