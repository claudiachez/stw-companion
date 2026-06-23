import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Independent filter state for the Trades blotter — deliberately separate from the Ticker
// Details FilterBar (useFiltersStore) so the two tabs never collide. A trade row is per-LEG,
// so the relevant axes differ: open/closed is the leg's own status (not the position's
// New/Upsized/Trimmed/Closed action), and "type" is binary (a leg is shares OR options —
// "mixed" is a position concept, not a leg one).

export type TradeOpenClosed = 'all' | 'open' | 'closed';
export type TradeType = '' | 'shares' | 'options';
export type TradeSort =
  | 'opened_desc' | 'opened_asc'
  | 'closed_desc' | 'closed_asc'
  | 'pnl_desc' | 'pnl_asc'
  | 'az' | 'za';

export interface TradesFilters {
  search: string;
  basket: string;        // sector; '' = all
  type: TradeType;
  openClosed: TradeOpenClosed;
  sort: TradeSort;
}

interface TradesFiltersState extends TradesFilters {
  setSearch:     (v: string) => void;
  setBasket:     (v: string) => void;
  setType:       (v: TradeType) => void;
  setOpenClosed: (v: TradeOpenClosed) => void;
  setSort:       (v: TradeSort) => void;
  reset:         () => void;
}

const DEFAULTS: TradesFilters = {
  search: '', basket: '', type: '', openClosed: 'all', sort: 'opened_desc',
};

export const useTradesFiltersStore = create<TradesFiltersState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setSearch:     (search)     => set({ search }),
      setBasket:     (basket)     => set({ basket }),
      setType:       (type)       => set({ type }),
      setOpenClosed: (openClosed) => set({ openClosed }),
      setSort:       (sort)       => set({ sort }),
      reset: () => set({ ...DEFAULTS }),
    }),
    { name: 'stw-trades-filters' },
  ),
);
