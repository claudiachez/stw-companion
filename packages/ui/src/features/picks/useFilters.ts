import { create } from 'zustand';
import { type SortMode } from '@stw/shared';

// Pure filter/sort logic lives in @stw/shared (shared by web + admin).
// Re-exported here so call sites can import from one feature module.
export { applyFilters, sortFlat } from '@stw/shared';
export type { SortMode };

interface FiltersState {
  search:  string;
  basket:  string;
  tier:    string;   // '' | '5'..'0'
  status:  string;   // '' | 'New' | 'Upsized' | 'Hold' | 'Trimmed' | 'Closed'
  type:    string;   // '' | 'shares' | 'options' | 'mixed'
  hideClosed: boolean; // default true — hide Closed positions unless filtered for
  sort:    SortMode;
  setSearch:  (v: string) => void;
  setBasket:  (v: string) => void;
  setTier:    (v: string) => void;
  setStatus:  (v: string) => void;
  setType:    (v: string) => void;
  setHideClosed: (v: boolean) => void;
  setSort:    (v: SortMode) => void;
  reset:      () => void;
  // Legacy compat used by old FilterBar
  conviction: number | null;
  setConviction: (v: number | null) => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  search: '', basket: '', tier: '', status: '', type: '', hideClosed: true, sort: 'conviction',
  conviction: null,
  setSearch:     (search)     => set({ search }),
  setBasket:     (basket)     => set({ basket }),
  setTier:       (tier)       => set({ tier, conviction: tier ? Number(tier) : null }),
  setStatus:     (status)     => set({ status }),
  setType:       (type)       => set({ type }),
  setHideClosed: (hideClosed) => set({ hideClosed }),
  setSort:       (sort)       => set({ sort }),
  setConviction: (conviction) => set({ conviction, tier: conviction !== null ? String(conviction) : '' }),
  reset: () => set({ search: '', basket: '', tier: '', status: '', type: '', hideClosed: true, sort: 'conviction', conviction: null }),
}));
