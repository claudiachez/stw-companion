import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConvictionBand } from '@stw/shared';

// Independent filter state for the Trades blotter — deliberately separate from the Ticker
// Details FilterBar (useFiltersStore) so the two tabs never collide. A trade row is per-LEG,
// so the relevant axes differ: open/closed is the leg's own status (not the position's
// New/Upsized/Trimmed/Closed action), and "type" is binary (a leg is shares OR options —
// "mixed" is a position concept, not a leg one).

export type TradeOpenClosed = 'all' | 'open' | 'closed';
export type TradeType = '' | 'shares' | 'options';
// Sort keys mirror the redesigned blotter's Sort dropdown + sortable column heads.
export type TradeSort =
  | 'last'   // last action (max of open/close date), desc — the default
  | 'new'    // opened newest
  | 'old'    // opened oldest
  | 'pnlD' | 'pnlU'
  | 'wtD'    // initial weight desc
  | 'az';

export interface TradesFilters {
  search: string;
  basket: string;              // basket (thematic grouping); '' = all
  conviction: ConvictionBand;  // underlying's STW conviction band (shared with My Portfolio)
  sector: string;              // GICS market sector; '' = all
  action: string;              // lot's lifecycle action (New / Close / Expired); '' = all
  type: TradeType;
  openClosed: TradeOpenClosed;
  sort: TradeSort;
}

interface TradesFiltersState extends TradesFilters {
  setSearch:     (v: string) => void;
  setBasket:     (v: string) => void;
  setConviction: (v: ConvictionBand) => void;
  setSector:     (v: string) => void;
  setAction:     (v: string) => void;
  setType:       (v: TradeType) => void;
  setOpenClosed: (v: TradeOpenClosed) => void;
  setSort:       (v: TradeSort) => void;
  reset:         () => void;
}

const DEFAULTS: TradesFilters = {
  search: '', basket: '', conviction: '', sector: '', action: '', type: '', openClosed: 'all', sort: 'last',
};

export const useTradesFiltersStore = create<TradesFiltersState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setSearch:     (search)     => set({ search }),
      setBasket:     (basket)     => set({ basket }),
      setConviction: (conviction) => set({ conviction }),
      setSector:     (sector)     => set({ sector }),
      setAction:     (action)     => set({ action }),
      setType:       (type)       => set({ type }),
      setOpenClosed: (openClosed) => set({ openClosed }),
      setSort:       (sort)       => set({ sort }),
      reset: () => set({ ...DEFAULTS }),
    }),
    { name: 'stw-trades-filters-v2' },
  ),
);
