import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// The three sub-views of the Stock Picks page.
export type PicksTab = 'overview' | 'positions' | 'trades';

export const PICKS_TABS: PicksTab[] = ['overview', 'positions', 'trades'];

export const PICKS_TAB_LABELS: Record<PicksTab, string> = {
  overview: 'Portfolio Overview',
  positions: 'Ticker Details',
  trades: 'Trades',
};

export function isPicksTab(v: unknown): v is PicksTab {
  return typeof v === 'string' && (PICKS_TABS as string[]).includes(v);
}

// Map any legacy/unknown value (e.g. the old 'transactions' key) to a valid tab.
export function coercePicksTab(v: unknown): PicksTab {
  if (v === 'transactions') return 'trades';
  return isPicksTab(v) ? v : 'positions';
}

// The user's preferred landing sub-tab. Persisted to localStorage (instant/offline) and
// synced to the profile (cross-device) via usePreferencesSync, same as theme + filters.
interface PicksTabState {
  defaultTab: PicksTab;
  setDefaultTab: (t: PicksTab) => void;
  /** Apply a saved value from profile prefs (no-op if absent). */
  hydrate: (t?: string | null) => void;
}

export const usePicksTabStore = create<PicksTabState>()(
  persist(
    (set) => ({
      defaultTab: 'positions',
      setDefaultTab: (defaultTab) => set({ defaultTab }),
      hydrate: (t) => { if (t) set({ defaultTab: coercePicksTab(t) }); },
    }),
    {
      name: 'stw-picks-default-tab',
      version: 1,
      // v0 used 'transactions'; coerce it to the renamed 'trades'.
      migrate: (state: unknown) => {
        const s = state as { defaultTab?: unknown } | null;
        if (s) s.defaultTab = coercePicksTab(s.defaultTab);
        return s as PicksTabState;
      },
    },
  ),
);
