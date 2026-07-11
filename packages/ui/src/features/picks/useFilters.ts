import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type SortMode } from '@stw/shared';
import type { TrendBucket, SectorStanding } from '@stw/shared';

// Pure filter/sort logic lives in @stw/shared (shared by web + admin).
// Re-exported here so call sites can import from one feature module.
export { applyFilters, sortFlat, sortByPnl } from '@stw/shared';
export type { SortMode };

// Serializable filter prefs — persisted to localStorage (instant) and synced to the
// user's profile (cross-device) via usePreferencesSync.
export interface PicksFilters {
  search: string;
  basket: string;
  tier: string;
  status: string;
  type: string;
  structure: TrendBucket | '';   // ticker's own 9/21/200 trend structure
  standing: SectorStanding | ''; // sector rotation standing (sector regime)
  sector: string;                // GICS market sector; '' = all
  hideClosed: boolean;
  sort: SortMode;
}

interface FiltersState extends PicksFilters {
  setSearch:  (v: string) => void;
  setBasket:  (v: string) => void;
  setTier:    (v: string) => void;
  setStatus:  (v: string) => void;
  setType:    (v: string) => void;
  setStructure: (v: TrendBucket | '') => void;
  setStanding:  (v: SectorStanding | '') => void;
  setSector:    (v: string) => void;
  setHideClosed: (v: boolean) => void;
  setSort:    (v: SortMode) => void;
  reset:      () => void;
  /** Apply a saved filter set (from profile prefs). Missing fields keep current value. */
  hydrate:    (p: Partial<PicksFilters>) => void;
  // Legacy compat used by old FilterBar
  conviction: number | null;
  setConviction: (v: number | null) => void;
}

const DEFAULTS: PicksFilters = {
  search: '', basket: '', tier: '', status: '', type: '',
  structure: '', standing: '', sector: '', hideClosed: true, sort: 'conviction',
};

export const selectPicksFilters = (s: FiltersState): PicksFilters => ({
  search: s.search, basket: s.basket, tier: s.tier, status: s.status,
  type: s.type, structure: s.structure, standing: s.standing, sector: s.sector,
  hideClosed: s.hideClosed, sort: s.sort,
});

export const useFiltersStore = create<FiltersState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      conviction: null,
      setSearch:     (search)     => set({ search }),
      setBasket:     (basket)     => set({ basket }),
      setTier:       (tier)       => set({ tier, conviction: tier ? Number(tier) : null }),
      setStatus:     (status)     => set({ status }),
      setType:       (type)       => set({ type }),
      setStructure:  (structure)  => set({ structure }),
      setStanding:   (standing)   => set({ standing }),
      setSector:     (sector)     => set({ sector }),
      setHideClosed: (hideClosed) => set({ hideClosed }),
      setSort:       (sort)       => set({ sort }),
      setConviction: (conviction) => set({ conviction, tier: conviction !== null ? String(conviction) : '' }),
      reset: () => set({ ...DEFAULTS, conviction: null }),
      hydrate: (p) => set((s) => {
        const tier = p.tier ?? s.tier;
        return {
          search:     p.search     ?? s.search,
          basket:     p.basket     ?? s.basket,
          tier,
          status:     p.status     ?? s.status,
          type:       p.type       ?? s.type,
          structure:  p.structure  ?? s.structure,
          standing:   p.standing   ?? s.standing,
          sector:     p.sector     ?? s.sector,
          hideClosed: p.hideClosed ?? s.hideClosed,
          sort:       p.sort       ?? s.sort,
          conviction: tier ? Number(tier) : null,
        };
      }),
    }),
    {
      name: 'stw-picks-filters',
      // Only the filter values; setters/conviction derive from them.
      partialize: (s) => selectPicksFilters(s),
    },
  ),
);
