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

const sel =
  'bg-bg border border-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-acc transition-colors';

interface Props {
  holdings: Holding[];
  filtered: number;
}

export function FilterBar({ holdings, filtered }: Props) {
  const { search, basket, tier, status, type, sort, setSearch, setBasket, setTier, setStatus, setType, setSort, reset } =
    useFiltersStore();

  const baskets = [...new Set(holdings.map((h) => h.basket).filter(Boolean))].sort();
  const hasFilter = search || basket || tier || status || type;

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-bsub"
      style={{ background: 'var(--surface)' }}
    >
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search ticker…"
        className="bg-bg border border-border rounded px-2 py-1 text-xs text-text placeholder-t3 focus:outline-none focus:border-acc w-36 transition-colors"
      />

      <select value={basket} onChange={(e) => setBasket(e.target.value)} className={sel}>
        <option value="">All Baskets</option>
        {baskets.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>

      <select value={tier} onChange={(e) => setTier(e.target.value)} className={sel}>
        <option value="">All Tiers</option>
        <option value="5">Tier 1 — Highest</option>
        <option value="4">Tier 2 — High</option>
        <option value="3">Tier 3 — Moderate</option>
        <option value="2">Tier 4 — Waning</option>
        <option value="1">Tier 5 — Concern</option>
        <option value="0">Tier 6 — Legacy</option>
      </select>

      <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
        <option value="">All Status</option>
        <option value="New">New</option>
        <option value="Upsized">Upsized</option>
        <option value="Hold">Hold</option>
        <option value="Trimmed">Trimmed</option>
        <option value="Closed">Closed</option>
      </select>

      <select value={type} onChange={(e) => setType(e.target.value)} className={sel}>
        <option value="">All Types</option>
        <option value="shares">Shares</option>
        <option value="options">Options</option>
        <option value="mixed">Mixed</option>
      </select>

      <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className={sel}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {hasFilter && (
        <button onClick={reset} className="text-t3 text-xs hover:text-t2 transition-colors px-1">
          Clear
        </button>
      )}

      <span className="ml-auto text-t3 text-xs">
        {hasFilter ? `${filtered} of ${holdings.length}` : `${holdings.length} positions`}
      </span>
    </div>
  );
}
