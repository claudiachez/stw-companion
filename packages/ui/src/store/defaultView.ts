import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// The user's preferred landing view — which top-level page opens on sign-in / at the app root.
// Persisted to localStorage (instant/offline) and synced to the profile (cross-device) via
// usePreferencesSync, exactly like theme + the Stock Picks default sub-tab.
export type DefaultView = '/picks' | '/signals' | '/macro' | '/portfolio';

export const DEFAULT_VIEWS: DefaultView[] = ['/picks', '/signals', '/macro', '/portfolio'];

export const DEFAULT_VIEW_LABELS: Record<DefaultView, string> = {
  '/picks': 'Stock Picks',
  '/signals': 'GEX Signals',
  '/macro': 'Macro',
  '/portfolio': 'My Portfolio',
};

export function isDefaultView(v: unknown): v is DefaultView {
  return typeof v === 'string' && (DEFAULT_VIEWS as string[]).includes(v);
}

export function coerceDefaultView(v: unknown): DefaultView {
  return isDefaultView(v) ? v : '/picks';
}

interface DefaultViewState {
  defaultView: DefaultView;
  setDefaultView: (v: DefaultView) => void;
  /** Apply a saved value from profile prefs (no-op if absent). */
  hydrate: (v?: string | null) => void;
}

export const useDefaultViewStore = create<DefaultViewState>()(
  persist(
    (set) => ({
      defaultView: '/picks',
      setDefaultView: (defaultView) => set({ defaultView }),
      hydrate: (v) => { if (v) set({ defaultView: coerceDefaultView(v) }); },
    }),
    { name: 'stw-default-view' },
  ),
);
