import { create } from 'zustand';
import type { Holding } from './api';
import { positionType } from './constants';

export type SortMode = 'conviction' | 'az' | 'za' | 'recent' | 'oldest' | 'weight_desc' | 'weight_asc';

interface FiltersState {
  search:  string;
  basket:  string;
  tier:    string;   // '' | '5'..'0'
  status:  string;   // '' | 'New' | 'Upsized' | 'Hold' | 'Trimmed' | 'Closed'
  type:    string;   // '' | 'shares' | 'options' | 'mixed'
  sort:    SortMode;
  setSearch:  (v: string) => void;
  setBasket:  (v: string) => void;
  setTier:    (v: string) => void;
  setStatus:  (v: string) => void;
  setType:    (v: string) => void;
  setSort:    (v: SortMode) => void;
  reset:      () => void;
  // Legacy compat used by old FilterBar
  conviction: number | null;
  setConviction: (v: number | null) => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  search: '', basket: '', tier: '', status: '', type: '', sort: 'conviction',
  conviction: null,
  setSearch:     (search)     => set({ search }),
  setBasket:     (basket)     => set({ basket }),
  setTier:       (tier)       => set({ tier, conviction: tier ? Number(tier) : null }),
  setStatus:     (status)     => set({ status }),
  setType:       (type)       => set({ type }),
  setSort:       (sort)       => set({ sort }),
  setConviction: (conviction) => set({ conviction, tier: conviction !== null ? String(conviction) : '' }),
  reset: () => set({ search: '', basket: '', tier: '', status: '', type: '', sort: 'conviction', conviction: null }),
}));

export function applyFilters(holdings: Holding[], f: FiltersState): Holding[] {
  return holdings.filter((h) => {
    if (f.basket && h.basket !== f.basket) return false;
    if (f.tier   && h.conviction !== Number(f.tier)) return false;
    if (f.status && h.last_action !== f.status) return false;
    if (f.type   && positionType(h.position_detail) !== f.type) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!h.ticker.toLowerCase().includes(q) &&
          !(h.name ?? '').toLowerCase().includes(q) &&
          !(h.basket ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function sortFlat(holdings: Holding[], sort: SortMode): Holding[] {
  const dateVal = (h: Holding) => h.action_date ? new Date(h.action_date).getTime() : 0;
  const fns: Record<string, (a: Holding, b: Holding) => number> = {
    conviction:  (a, b) => b.conviction - a.conviction || a.rank - b.rank,
    az:          (a, b) => a.ticker.localeCompare(b.ticker),
    za:          (a, b) => b.ticker.localeCompare(a.ticker),
    recent:      (a, b) => dateVal(b) - dateVal(a),
    oldest:      (a, b) => dateVal(a) - dateVal(b),
    weight_desc: (a, b) => (b.current_weight ?? 0) - (a.current_weight ?? 0),
    weight_asc:  (a, b) => (a.current_weight ?? 0) - (b.current_weight ?? 0),
  };
  return [...holdings].sort(fns[sort] ?? fns.conviction);
}
