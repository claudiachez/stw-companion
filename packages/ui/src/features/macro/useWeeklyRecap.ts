import { useState, useCallback, useEffect } from 'react';
import type { MacroRecap, MacroRecapRequest } from '@stw/shared';
import { isoWeekKey } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { getSupabase } from '../../lib/supabase';

const LS_KEY = `macro-recap-v2-${isoWeekKey()}`;

function loadCached(): MacroRecap | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) as MacroRecap : null;
  } catch { return null; }
}

export function useWeeklyRecap() {
  const user = useAuthStore((s) => s.user);
  const [recap, setRecap] = useState<MacroRecap | null>(loadCached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // The recap is a cross-device row (everyone reads the same week's note) — check
  // macro_weekly_recaps first; only fall back to the per-browser cache if the table
  // read fails (e.g. sandbox pre-migration), same degrade-gracefully pattern as
  // useMacroPrefs.
  useEffect(() => {
    getSupabase()
      .from('macro_weekly_recaps')
      .select('recap, generated_at')
      .eq('week_key', isoWeekKey())
      .maybeSingle()
      .then(({ data, error: readError }) => {
        if (!readError && data?.recap) {
          setRecap({ ...(data.recap as MacroRecap), generatedAt: data.generated_at });
        }
        setLoaded(true);
      });
  }, []);

  const generate = useCallback(async (payload: MacroRecapRequest, note?: string) => {
    setLoading(true);
    setError(null);
    try {
      const session = await getSupabase().auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch('/.netlify/functions/macro-recap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(note?.trim() ? { ...payload, note: note.trim() } : payload),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const b = await res.json() as { error?: string }; if (b?.error) detail = b.error; } catch { /* non-JSON body */ }
        throw new Error(detail);
      }
      const data = await res.json() as MacroRecap;
      setRecap(data);
      try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate recap');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  return { recap, loading, error, loaded, generate };
}
