import type { Holding } from '../api';
import { useFiltersStore, type SortMode } from '../useFilters';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'conviction',  label: 'Sort: Conviction' },
  { value: 'az',          label: 'Sort: A → Z' },
  { value: 'za',          label: 'Sort: Z → A' },
  { value: 'recent',      label: 'Sort: Newest' },
  { value: 'oldest',      label: 'Sort: Oldest' },
  { value: 'weight_desc', label: 'Sort: Weight ↓' },
  { value: 'weight_asc',  label: 'Sort: Weight ↑' },
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
  holdings: Holding[];
  filtered: number;
}

export function FilterBar({ holdings, filtered }: Props) {
  const { search, basket, tier, status, type, hideClosed, sort, setSearch, setBasket, setTier, setStatus, setType, setHideClosed, setSort, reset } =
    useFiltersStore();

  const baskets = [...new Set(holdings.map((h) => h.basket).filter(Boolean))].sort();
  const hasFilter = search || basket || tier || status || type || !hideClosed;

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', minWidth: 'max-content' }}>

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

        <select value={tier} onChange={(e) => setTier(e.target.value)} style={ctrlStyle}>
          <option value="">All Tiers</option>
          <option value="5">Tier 1 — Highest</option>
          <option value="4">Tier 2 — High</option>
          <option value="3">Tier 3 — Moderate</option>
          <option value="2">Tier 4 — Waning</option>
          <option value="1">Tier 5 — Concern</option>
          <option value="0">Tier 6 — Legacy</option>
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)} style={ctrlStyle}>
          <option value="">All Status</option>
          <option value="New">New</option>
          <option value="Upsized">Upsized</option>
          <option value="Hold">Hold</option>
          <option value="Trimmed">Trimmed</option>
          <option value="Closed">Closed</option>
        </select>

        <select value={type} onChange={(e) => setType(e.target.value)} style={ctrlStyle}>
          <option value="">All Types</option>
          <option value="shares">Shares</option>
          <option value="options">Options</option>
          <option value="mixed">Mixed</option>
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} style={ctrlStyle}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label
          style={{ ...ctrlStyle, display: 'flex', alignItems: 'center', gap: 6, color: hideClosed ? 'var(--t2)' : 'var(--text)' }}
          title="Show closed positions"
        >
          <input
            type="checkbox"
            checked={!hideClosed}
            onChange={(e) => setHideClosed(!e.target.checked)}
            style={{ accentColor: 'var(--acc)', cursor: 'pointer' }}
          />
          Show closed
        </label>

        {hasFilter && (
          <button
            onClick={reset}
            style={{ ...ctrlStyle, border: 'none', background: 'none', color: 'var(--t3)', padding: '0 4px', cursor: 'pointer' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
          >
            Clear
          </button>
        )}

        <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 4, whiteSpace: 'nowrap' }}>
          {hasFilter ? `${filtered} of ${holdings.length}` : `${holdings.length} positions`}
        </span>
      </div>
    </div>
  );
}
