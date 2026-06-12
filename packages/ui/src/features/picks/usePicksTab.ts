import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// The three sub-views of the Stock Picks page.
export type PicksTab = 'overview' | 'positions' | 'transactions';

export const PICKS_TAB_LABELS: Record<PicksTab, string> = {
  overview: 'Portfolio Overview',
  positions: 'Ticker Details',
  transactions: 'Transactions',
};

// The user's preferred landing sub-tab. Persisted to localStorage (instant/offline) and
// synced to the profile (cross-device) via usePreferencesSync, same as theme + filters.
interface PicksTabState {
  defaultTab: PicksTab;
  setDefaultTab: (t: PicksTab) => void;
  /** Apply a saved value from profile prefs (no-op if absent). */
  hydrate: (t?: PicksTab) => void;
}

export const usePicksTabStore = create<PicksTabState>()(
  persist(
    (set) => ({
      defaultTab: 'positions',
      setDefaultTab: (defaultTab) => set({ defaultTab }),
      hydrate: (t) => { if (t) set({ defaultTab: t }); },
    }),
    { name: 'stw-picks-default-tab' },
  ),
);
