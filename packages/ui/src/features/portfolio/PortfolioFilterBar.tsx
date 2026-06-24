// Filter + sort bar for the My Portfolio tab. Mirrors the Ticker Details FilterBar
// chrome (full-bleed surface bar, horizontal scroll on mobile, same control styling)
// so the sibling surfaces read as one app. State is owned by PortfolioPage and passed
// in — this component is purely presentational.

export type PortfolioSort =
  | 'pnl_desc' | 'pnl_asc'
  | 'value_desc' | 'value_asc'
  | 'az' | 'za';

export type PortfolioType = '' | 'stocks' | 'options';

export interface PortfolioFilters {
  sort: PortfolioSort;
  type: PortfolioType;
  stwOnly: boolean;
}

export const DEFAULT_PORTFOLIO_FILTERS: PortfolioFilters = {
  sort: 'pnl_desc',
  type: '',
  stwOnly: false,
};

const SORT_OPTIONS: { value: PortfolioSort; label: string }[] = [
  { value: 'pnl_desc',   label: 'Sort: P&L ↓' },
  { value: 'pnl_asc',    label: 'Sort: P&L ↑' },
  { value: 'value_desc', label: 'Sort: Value ↓' },
  { value: 'value_asc',  label: 'Sort: Value ↑' },
  { value: 'az',         label: 'Sort: A → Z' },
  { value: 'za',         label: 'Sort: Z → A' },
];

const ctrlStyle: React.CSSProperties = {
  height: 34,
  padding: '0 8px',
  fontSize: 12,
  borderRadius: 5,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  cursor: 'pointer',
  outline: 'none',
  flexShrink: 0,
};

interface Props {
  filters: PortfolioFilters;
  onChange: (next: PortfolioFilters) => void;
  /** Groups after filtering / total groups, for the "N of total" count. */
  filtered: number;
  total: number;
}

export function PortfolioFilterBar({ filters, onChange, filtered, total }: Props) {
  const { sort, type, stwOnly } = filters;
  const hasFilter = type !== '' || stwOnly;

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', minWidth: 'max-content' }}>

        <select value={sort} onChange={(e) => onChange({ ...filters, sort: e.target.value as PortfolioSort })} style={ctrlStyle}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select value={type} onChange={(e) => onChange({ ...filters, type: e.target.value as PortfolioType })} style={ctrlStyle}>
          <option value="">All Types</option>
          <option value="stocks">Stocks</option>
          <option value="options">Options</option>
        </select>

        <label
          style={{ ...ctrlStyle, display: 'flex', alignItems: 'center', gap: 6, color: stwOnly ? 'var(--text)' : 'var(--t2)' }}
          title="Show only positions that are STW picks"
        >
          <input
            type="checkbox"
            checked={stwOnly}
            onChange={(e) => onChange({ ...filters, stwOnly: e.target.checked })}
            style={{ accentColor: 'var(--acc)', cursor: 'pointer' }}
          />
          STW picks
        </label>

        {hasFilter && (
          <button
            onClick={() => onChange({ ...filters, type: '', stwOnly: false })}
            style={{ ...ctrlStyle, border: 'none', background: 'none', color: 'var(--t3)', padding: '0 4px', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
          >
            Clear
          </button>
        )}

        <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 4, whiteSpace: 'nowrap' }}>
          {filtered < total ? `${filtered} of ${total}` : `${total} position${total === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  );
}
