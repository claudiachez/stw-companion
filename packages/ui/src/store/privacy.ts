import { create } from 'zustand';

// "Show dollar amounts" — a global privacy preference. When off, money-showing
// surfaces render percentages only (for screen-sharing). Persisted to
// localStorage for instant/offline restore, and cross-device via
// profiles.preferences.showMoney (usePreferencesSync). Consumers read
// `showMoney` as those surfaces are redesigned (Overview privacy toggle etc.);
// this store is the single source they share. Defaults ON (show money).

function initialShowMoney(): boolean {
  const raw = localStorage.getItem('showMoney');
  return raw === null ? true : raw === 'true';
}

interface PrivacyState {
  showMoney: boolean;
  toggle: () => void;
  /** Set explicitly (used when hydrating from the user's saved profile prefs). */
  setShowMoney: (v: boolean) => void;
}

export const usePrivacyStore = create<PrivacyState>((set) => ({
  showMoney: initialShowMoney(),
  toggle: () =>
    set((s) => {
      const next = !s.showMoney;
      localStorage.setItem('showMoney', String(next));
      return { showMoney: next };
    }),
  setShowMoney: (v) =>
    set(() => {
      localStorage.setItem('showMoney', String(v));
      return { showMoney: v };
    }),
}));
