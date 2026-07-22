import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { useFiltersStore, selectPicksFilters } from '../features/picks/useFilters';
import { usePicksTabStore } from '../features/picks/usePicksTab';
import { useDefaultViewStore } from '../store/defaultView';
import { useRegimeInstrumentStore } from '../features/regime/useRegimeInstrument';
import { usePrivacyStore } from '../store/privacy';
import { loadPreferences, savePreferences } from './preferences';

// Per-user theme + Stock Picks filter persistence.
// - localStorage (theme store + persisted filters store) gives instant/offline restore.
// - On login we load the user's profile prefs (cross-device source of truth) and apply
//   them, then debounce-save any later change back to the profile.
// Mounted once in AuthGuard, so it covers both the web and admin shells.
export function usePreferencesSync() {
  const userId   = useAuthStore((s) => s.user?.id ?? null);
  const theme    = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const filters  = useFiltersStore(useShallow(selectPicksFilters));
  const hydrate  = useFiltersStore((s) => s.hydrate);
  const defaultTab    = usePicksTabStore((s) => s.defaultTab);
  const hydrateTab    = usePicksTabStore((s) => s.hydrate);
  const defaultView   = useDefaultViewStore((s) => s.defaultView);
  const hydrateView   = useDefaultViewStore((s) => s.hydrate);
  const regimeInstrument = useRegimeInstrumentStore((s) => s.instrument);
  const setRegimeInstrument = useRegimeInstrumentStore((s) => s.setInstrument);
  const showMoney = usePrivacyStore((s) => s.showMoney);
  const setShowMoney = usePrivacyStore((s) => s.setShowMoney);
  const loadedFor = useRef<string | null>(null);

  // Load once per signed-in user; profile wins over localStorage (cross-device intent).
  useEffect(() => {
    if (!userId) { loadedFor.current = null; return; }
    if (loadedFor.current === userId) return;
    let cancelled = false;
    loadPreferences(userId).then((prefs) => {
      if (cancelled) return;
      if (prefs?.theme) setTheme(prefs.theme);
      if (prefs?.picksFilters) hydrate(prefs.picksFilters);
      if (prefs?.picksDefaultTab) hydrateTab(prefs.picksDefaultTab);
      if (prefs?.defaultView) hydrateView(prefs.defaultView);
      if (prefs?.regimeInstrument) setRegimeInstrument(prefs.regimeInstrument);
      if (prefs?.showMoney !== undefined) setShowMoney(prefs.showMoney);
      loadedFor.current = userId;
    });
    return () => { cancelled = true; };
  }, [userId, setTheme, hydrate]);

  // Save changes (debounced), only after this user's prefs have loaded.
  useEffect(() => {
    if (!userId || loadedFor.current !== userId) return;
    const t = setTimeout(() => {
      savePreferences({ theme, picksFilters: filters, picksDefaultTab: defaultTab, defaultView, regimeInstrument, showMoney });
    }, 800);
    return () => clearTimeout(t);
  }, [userId, theme, filters, defaultTab, defaultView, regimeInstrument, showMoney]);
}
