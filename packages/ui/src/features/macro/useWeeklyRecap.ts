import { useState, useCallback } from 'react';
import type { MacroRecap, MacroIndicator } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { getSupabase } from '../../lib/supabase';

function isoWeekKey(): string {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `macro-recap-${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function loadCached(): MacroRecap | null {
  try {
    const raw = localStorage.getItem(isoWeekKey());
    return raw ? JSON.parse(raw) as MacroRecap : null;
  } catch { return null; }
}

export function useWeeklyRecap() {
  const user = useAuthStore((s) => s.user);
  const [recap, setRecap] = useState<MacroRecap | null>(loadCached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (
    indicators: MacroIndicator[],
    graddoxBias: string,
    graddoxBiasNote: string,
  ) => {
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
        body: JSON.stringify({
          indicators: indicators.map((i) => ({
            symbol: i.symbol,
            name: i.name,
            close: i.close,
            signal: i.signal,
            tier: i.tier,
          })),
          graddoxBias,
          graddoxBiasNote,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as MacroRecap;
      setRecap(data);
      try { localStorage.setItem(isoWeekKey(), JSON.stringify(data)); } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate recap');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  return { recap, loading, error, generate };
}
