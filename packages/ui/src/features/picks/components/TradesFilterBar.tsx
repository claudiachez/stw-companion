import type { Holding } from '../api';
import { useTradesFiltersStore, type TradeOpenClosed, type TradeSort, type TradeType } from '../useTradesFilters';
import { FONT_SIZE, CONVICTION_BAND_OPTIONS, type ConvictionBand } from '@stw/shared';
import { SegmentedControl, type SegmentOption } from '../../../primitives/SegmentedControl';

const SORT_OPTIONS: { value: TradeSort; label: string }[] = [
  { value: 'opened_desc', label: 'Sort: Opened newest' },
  { value: 'opened_asc',  label: 'Sort: Opened oldest' },
  { value: 'closed_desc', label: 'Sort: Closed newest' },
  { value: 'closed_asc',  label: 'Sort: Closed oldest' },
  { value: 'pnl_desc',    label: 'Sort: P&L ↓' },
  { value: 'pnl_asc',     label: 'Sort: P&L ↑' },
  { value: 'conviction',  label: 'Sort: Conviction' },
  { value: 'az',          label: 'Sort: A → Z' },
  { value: 'za',          label: 'Sort: Z → A' },
];

// Row-2 segmented groups (shared SegmentedControl primitive) — the "Show" state axis and the
// "Type" instrument axis, wired to the same store fields the old toggle/select used.
const SHOW_SEGMENTS: SegmentOption<TradeOpenClosed>[] = [
  { value: 'all',    label: 'All' },
  { value: 'open',   label: 'Open' },
  { value: 'closed', label: 'Closed' },
];
const TYPE_SEGMENTS: SegmentOption<TradeType>[] = [
  { value: '',        label: 'All' },
  { value: 'shares',  label: 'Shares' },
  { value: 'options', label: 'Options' },
];

// Shares the FilterBar control styling so the two tabs read as one app. Border color
// lives in ctrlBorderClass, never inline — see FilterBar.tsx's identical note (an
// inline style.border always wins over a stylesheet class, which would make
// `focus:border-acc` silently never take effect).
const ctrlStyle: React.CSSProperties = {
  height: 30, padding: '0 6px', fontSize: FONT_SIZE.sm, borderRadius: 5,
  background: 'var(--bg)', color: 'var(--text)',
  cursor: 'pointer', flexShrink: 0,
};
const ctrlBorderClass = 'border border-[var(--border)] focus:outline-none focus:border-acc';

interface Props {
  holdings: Holding[];
  sectors: string[];
  /** rows matching the current filter / total candidate rows — shown as "N of M lots". */
  count: number;
  total: number;
}

// Filter bar for the Transactions blotter. Mirrors the Ticker Details FilterBar chrome
// (full-bleed surface, two rows: dropdown filters up top, segmented axes below) so the two
// tabs stay visually consistent. Show = the leg's own open/closed state; Type = Shares/Options.
export function TradesFilterBar({ holdings, sectors, count, total }: Props) {
  const { search, basket, conviction, sector, type, openClosed, sort,
    setSearch, setBasket, setConviction, setSector, setType, setOpenClosed, setSort, reset } =
    useTradesFiltersStore();

  const baskets = [...new Set(holdings.map((h) => h.basket).filter(Boolean))].sort();
  const hasFilter = !!search || !!basket || !!conviction || !!sector || !!type || openClosed !== 'all';

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', flexShrink: 0 }}>
      {/* Row 1 — search + dropdown filters + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--bsub)', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker…"
          className={ctrlBorderClass}
          style={{ ...ctrlStyle, width: 112, padding: '0 8px', cursor: 'text' }}
        />

        <select value={basket} onChange={(e) => setBasket(e.target.value)} className={ctrlBorderClass} style={ctrlStyle}>
          <option value="">All Baskets</option>
          {baskets.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        <select value={conviction} onChange={(e) => setConviction(e.target.value as ConvictionBand)} className={ctrlBorderClass} style={ctrlStyle} title="Filter by the underlying's STW conviction tier">
          <option value="">All Conviction</option>
          {CONVICTION_BAND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {sectors.length > 0 && (
          <select value={sector} onChange={(e) => setSector(e.target.value)} className={ctrlBorderClass} style={ctrlStyle} title="Filter by GICS market sector">
            <option value="">All Sectors</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        <select value={sort} onChange={(e) => setSort(e.target.value as TradeSort)} className={ctrlBorderClass} style={ctrlStyle}>
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

        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginLeft: 'auto', paddingLeft: 0, whiteSpace: 'nowrap' }}>
          {count < total ? `${count} of ${total} lots` : `${total} lot${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Row 2 — segmented axes: Show (open/closed) + Type (instrument) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--bsub)', flexWrap: 'wrap' }}>
        <SegmentedControl
          label="Show"
          options={SHOW_SEGMENTS}
          value={openClosed}
          onChange={setOpenClosed}
        />
        <SegmentedControl
          label="Type"
          options={TYPE_SEGMENTS}
          value={type}
          onChange={setType}
        />
      </div>
    </div>
  );
}
