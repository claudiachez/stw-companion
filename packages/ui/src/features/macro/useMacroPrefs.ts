import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';
import type { MacroPrefs } from '@stw/shared';

const DEFAULT_VISIBLE = ['SPY', 'QQQ', 'VIX', 'US10Y'];
const LS_KEY = 'stw-macro-prefs';

function loadFromStorage(): MacroPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as MacroPrefs;
  } catch { /* ignore */ }
  return { visibleIndicators: DEFAULT_VISIBLE };
}

export function useMacroPrefs() {
  const user = useAuthStore((s) => s.user);
  const [prefs, setPrefs] = useState<MacroPrefs>(loadFromStorage);

  // Load from profiles if logged in (profiles PK is user_id, not id)
  useEffect(() => {
    if (!user) return;
    getSupabase()
      .from('profiles')
      .select('macro_prefs')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const mp = data.macro_prefs as MacroPrefs | null;
        if (mp && Array.isArray(mp.visibleIndicators) && mp.visibleIndicators.length > 0) {
          setPrefs(mp);
          localStorage.setItem(LS_KEY, JSON.stringify(mp));
        }
      });
  }, [user?.id]);

  const toggle = useCallback((symbol: string) => {
    setPrefs((prev) => {
      const vis = prev.visibleIndicators;
      const next: MacroPrefs = {
        visibleIndicators: vis.includes(symbol)
          ? vis.filter((s) => s !== symbol)
          : [...vis, symbol],
      };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      if (user) {
        // Use security-definer function (same pattern as set_my_preferences)
        getSupabase().rpc('set_my_macro_prefs', { prefs: next }).then(() => {});
      }
      return next;
    });
  }, [user?.id]);

  return { prefs, toggle, defaultVisible: DEFAULT_VISIBLE };
}
