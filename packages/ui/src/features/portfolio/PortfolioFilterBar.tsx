// Filter + sort controls for the My Portfolio tab. Control ORDER mirrors the Ticker Details /
// Trades filter bars (Search → Baskets → Types → Sort → toggles → Clear → count) so the tabs
// read as one app. Renders inner controls only (no surface wrapper); the page hosts them in one
// bar with the synced stamp + sync cluster. State is owned by PortfolioPage.

import { FONT_SIZE } from '@stw/shared';

export type PortfolioSort =
  | 'pnl_desc' | 'pnl_asc'
  | 'ret_desc' | 'ret_asc'
  | 'value_desc' | 'value_asc'
  | 'az' | 'za';

export type PortfolioType = '' | 'stocks' | 'options';

export interface PortfolioFilters {
  search: string;
  basket: string;
  type: PortfolioType;
  sort: PortfolioSort;
  tailedOnly: boolean;
  groupByTicker: boolean;
}

export const DEFAULT_PORTFOLIO_FILTERS: PortfolioFilters = {
  search: '',
  basket: '',
  type: '',
  sort: 'pnl_desc',
  tailedOnly: false,
  groupByTicker: true, // §6.3 — legs of the same underlying (shares + options) stay together by default
};

const SORT_OPTIONS: { value: PortfolioSort; label: string }[] = [
  { value: 'pnl_desc',   label: 'Sort: P&L ↓' },
  { value: 'pnl_asc',    label: 'Sort: P&L ↑' },
  { value: 'ret_desc',   label: 'Sort: Return ↓' },
  { value: 'ret_asc',    label: 'Sort: Return ↑' },
  { value: 'value_desc', label: 'Sort: Value ↓' },
  { value: 'value_asc',  label: 'Sort: Value ↑' },
  { value: 'az',         label: 'Sort: A → Z' },
  { value: 'za',         label: 'Sort: Z → A' },
];

// Border color lives in the class below, never in this inline style object — an inline
// `style.border` always wins over a stylesheet class regardless of specificity, which
// would make `ctrlBorderClass`'s `focus:border-acc` silently never take effect (found +
// fixed in TextInput.tsx the same session — see its header comment for the full story).
const ctrlStyle: React.CSSProperties = {
  height: 34, padding: '0 8px', fontSize: FONT_SIZE.sm, borderRadius: 5,
  background: 'var(--bg)', color: 'var(--text)',
  cursor: 'pointer', flexShrink: 0,
};

// For real keyboard-focus targets (text input, selects) — pairs the removed native
// outline with a visible border-color change on focus instead of just deleting it.
const ctrlBorderClass = 'border border-[var(--border)] focus:outline-none focus:border-acc';
// For the toggle `<label>` chips — same visible border, but the label itself never
// receives focus (the checkbox inside it does, and keeps its own native focus ring).
const ctrlBorderClassStatic = 'border border-[var(--border)]';

const toggleStyle = (on: boolean): React.CSSProperties => ({
  ...ctrlStyle, display: 'flex', alignItems: 'center', gap: 6, color: on ? 'var(--text)' : 'var(--t2)',
});

interface Props {
  filters: PortfolioFilters;
  onChange: (next: PortfolioFilters) => void;
  baskets: string[];
  filtered: number;
  total: number;
}

export function PortfolioFilterBar({ filters, onChange, baskets, filtered, total }: Props) {
  const { search, basket, type, sort, tailedOnly, groupByTicker } = filters;
  const hasFilter = !!search || !!basket || type !== '' || tailedOnly;

  return (
    <>
      <input
        type="text"
        value={search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search ticker…"
        className={ctrlBorderClass}
        style={{ ...ctrlStyle, width: 120, cursor: 'text' }}
      />

      {baskets.length > 0 && (
        <select value={basket} onChange={(e) => onChange({ ...filters, basket: e.target.value })} className={ctrlBorderClass} style={ctrlStyle}>
          <option value="">All Baskets</option>
          {baskets.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}

      <select value={type} onChange={(e) => onChange({ ...filters, type: e.target.value as PortfolioType })} className={ctrlBorderClass} style={ctrlStyle}>
        <option value="">All Types</option>
        <option value="stocks">Stocks</option>
        <option value="options">Options</option>
      </select>

      <select value={sort} onChange={(e) => onChange({ ...filters, sort: e.target.value as PortfolioSort })} className={ctrlBorderClass} style={ctrlStyle}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <label className={ctrlBorderClassStatic} style={toggleStyle(tailedOnly)} title="Show only positions that match a followed trader's pick">
        <input type="checkbox" checked={tailedOnly} onChange={(e) => onChange({ ...filters, tailedOnly: e.target.checked })} style={{ accentColor: 'var(--acc)', cursor: 'pointer' }} />
        Tailed only
      </label>

      <label className={ctrlBorderClassStatic} style={toggleStyle(groupByTicker)} title="Group legs by underlying ticker (off = flat per-leg table)">
        <input type="checkbox" checked={groupByTicker} onChange={(e) => onChange({ ...filters, groupByTicker: e.target.checked })} style={{ accentColor: 'var(--acc)', cursor: 'pointer' }} />
        Group by ticker
      </label>

      {hasFilter && (
        <button
          onClick={() => onChange({ ...filters, search: '', basket: '', type: '', tailedOnly: false })}
          style={{ ...ctrlStyle, background: 'none', color: 'var(--t3)', padding: '0 4px' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t2)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
        >
          Clear
        </button>
      )}

      <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginLeft: 4, whiteSpace: 'nowrap' }}>
        {filtered < total ? `${filtered} of ${total}` : `${total} position${total === 1 ? '' : 's'}`}
      </span>
    </>
  );
}
