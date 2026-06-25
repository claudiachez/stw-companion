// Filter + sort controls for the My Portfolio tab. Renders the inner controls only (no
// surface wrapper) so the page can host them in one bar alongside the sync cluster — mirroring
// the Ticker Details / Trades filter chrome. State is owned by PortfolioPage.

export type PortfolioSort =
  | 'pnl_desc' | 'pnl_asc'
  | 'ret_desc' | 'ret_asc'
  | 'value_desc' | 'value_asc'
  | 'az' | 'za';

export type PortfolioType = '' | 'stocks' | 'options';

export interface PortfolioFilters {
  search: string;
  sort: PortfolioSort;
  type: PortfolioType;
  basket: string;
  tailedOnly: boolean;
}

export const DEFAULT_PORTFOLIO_FILTERS: PortfolioFilters = {
  search: '',
  sort: 'pnl_desc',
  type: '',
  basket: '',
  tailedOnly: false,
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

const ctrlStyle: React.CSSProperties = {
  height: 34, padding: '0 8px', fontSize: 12, borderRadius: 5,
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
  cursor: 'pointer', outline: 'none', flexShrink: 0,
};

interface Props {
  filters: PortfolioFilters;
  onChange: (next: PortfolioFilters) => void;
  baskets: string[];
  filtered: number;
  total: number;
}

export function PortfolioFilterBar({ filters, onChange, baskets, filtered, total }: Props) {
  const { search, sort, type, basket, tailedOnly } = filters;
  const hasFilter = !!search || type !== '' || !!basket || tailedOnly;

  return (
    <>
      <input
        type="text"
        value={search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search ticker…"
        style={{ ...ctrlStyle, width: 120, cursor: 'text' }}
      />

      <select value={sort} onChange={(e) => onChange({ ...filters, sort: e.target.value as PortfolioSort })} style={ctrlStyle}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select value={type} onChange={(e) => onChange({ ...filters, type: e.target.value as PortfolioType })} style={ctrlStyle}>
        <option value="">All Types</option>
        <option value="stocks">Stocks</option>
        <option value="options">Options</option>
      </select>

      {baskets.length > 0 && (
        <select value={basket} onChange={(e) => onChange({ ...filters, basket: e.target.value })} style={ctrlStyle}>
          <option value="">All Baskets</option>
          {baskets.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}

      <label
        style={{ ...ctrlStyle, display: 'flex', alignItems: 'center', gap: 6, color: tailedOnly ? 'var(--text)' : 'var(--t2)' }}
        title="Show only positions that match a followed trader's pick"
      >
        <input
          type="checkbox"
          checked={tailedOnly}
          onChange={(e) => onChange({ ...filters, tailedOnly: e.target.checked })}
          style={{ accentColor: 'var(--acc)', cursor: 'pointer' }}
        />
        Tailed only
      </label>

      {hasFilter && (
        <button
          onClick={() => onChange({ ...filters, search: '', type: '', basket: '', tailedOnly: false })}
          style={{ ...ctrlStyle, border: 'none', background: 'none', color: 'var(--t3)', padding: '0 4px' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t2)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
        >
          Clear
        </button>
      )}

      <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 4, whiteSpace: 'nowrap' }}>
        {filtered < total ? `${filtered} of ${total}` : `${total} position${total === 1 ? '' : 's'}`}
      </span>
    </>
  );
}
