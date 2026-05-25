import { create } from 'zustand';
import type { Holding } from './api';

type SortKey = 'rank' | 'ticker' | 'conviction' | 'current_weight';
type SortDir = 'asc' | 'desc';

interface FiltersState {
  search: string;
  basket: string;
  conviction: number | null;
  sortKey: SortKey;
  sortDir: SortDir;
  setSearch: (v: string) => void;
  setBasket: (v: string) => void;
  setConviction: (v: number | null) => void;
  setSort: (key: SortKey) => void;
  reset: () => void;
}

export const useFiltersStore = create<FiltersState>((set, get) => ({
  search: '',
  basket: '',
  conviction: null,
  sortKey: 'rank',
  sortDir: 'asc',
  setSearch: (search) => set({ search }),
  setBasket: (basket) => set({ basket }),
  setConviction: (conviction) => set({ conviction }),
  setSort: (key) => {
    const { sortKey, sortDir } = get();
    set({ sortKey: key, sortDir: sortKey === key && sortDir === 'asc' ? 'desc' : 'asc' });
  },
  reset: () => set({ search: '', basket: '', conviction: null, sortKey: 'rank', sortDir: 'asc' }),
}));

export function applyFilters(holdings: Holding[], filters: FiltersState): Holding[] {
  let result = [...holdings];

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (h) => h.ticker.toLowerCase().includes(q) || h.name.toLowerCase().includes(q),
    );
  }

  if (filters.basket) {
    result = result.filter((h) => h.basket === filters.basket);
  }

  if (filters.conviction !== null) {
    result = result.filter((h) => h.conviction === filters.conviction);
  }

  result.sort((a, b) => {
    const av = a[filters.sortKey] ?? 0;
    const bv = b[filters.sortKey] ?? 0;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return filters.sortDir === 'asc' ? cmp : -cmp;
  });

  return result;
}
