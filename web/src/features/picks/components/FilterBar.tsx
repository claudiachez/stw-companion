import type { Holding } from '../api';
import { useFiltersStore } from '../useFilters';

const CONVICTION_LABELS: Record<number, string> = {
  5: 'Highest', 4: 'High', 3: 'Moderate', 2: 'Waning', 1: 'Concern', 0: 'Legacy',
};

interface Props {
  holdings: Holding[];
}

export function FilterBar({ holdings }: Props) {
  const { search, basket, conviction, setSearch, setBasket, setConviction, reset } = useFiltersStore();

  const baskets = [...new Set(holdings.map((h) => h.basket).filter(Boolean))].sort();
  const hasFilters = search || basket || conviction !== null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search ticker or name…"
        className="bg-s2 border border-border rounded-md px-3 py-1.5 text-sm text-text placeholder-t3 focus:outline-none focus:border-acc w-48"
      />

      <select
        value={basket}
        onChange={(e) => setBasket(e.target.value)}
        className="bg-s2 border border-border rounded-md px-2 py-1.5 text-sm text-text focus:outline-none focus:border-acc"
      >
        <option value="">All baskets</option>
        {baskets.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>

      <select
        value={conviction ?? ''}
        onChange={(e) => setConviction(e.target.value === '' ? null : Number(e.target.value))}
        className="bg-s2 border border-border rounded-md px-2 py-1.5 text-sm text-text focus:outline-none focus:border-acc"
      >
        <option value="">All conviction</option>
        {Object.entries(CONVICTION_LABELS)
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
      </select>

      {hasFilters && (
        <button
          onClick={reset}
          className="text-t3 text-xs hover:text-t2 transition-colors px-2 py-1.5"
        >
          Clear
        </button>
      )}

      <span className="ml-auto text-t3 text-xs">{holdings.length} positions</span>
    </div>
  );
}
