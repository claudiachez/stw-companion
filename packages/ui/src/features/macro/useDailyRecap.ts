import { useState, useCallback, useEffect } from 'react';
import type { MacroDailyRecap, MacroRecapRequest, RecapSession } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { getSupabase } from '../../lib/supabase';

interface DailyRecapRow {
  date: string;
  session: RecapSession;
  recap: MacroDailyRecap;
  generated_at: string;
}

export function useDailyRecap() {
  const user = useAuthStore((s) => s.user);
  const [recap, setRecap] = useState<MacroDailyRecap | null>(null);
  const [recapDate, setRecapDate] = useState<string | null>(null);
  const [recapSession, setRecapSession] = useState<RecapSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load the most recent daily recap (latest date + latest session for that date).
  useEffect(() => {
    getSupabase()
      .from('macro_daily_recaps')
      .select('date, session, recap, generated_at')
      .order('date', { ascending: false })
      .order('session', { ascending: false }) // 'pm' sorts after 'am'
      .limit(1)
      .maybeSingle()
      .then(({ data, error: readError }) => {
        if (!readError && data) {
          const row = data as DailyRecapRow;
          setRecap({ ...(row.recap as MacroDailyRecap), session: row.session, generatedAt: row.generated_at });
          setRecapDate(row.date);
          setRecapSession(row.session);
        }
        setLoaded(true);
      });
  }, []);

  const generate = useCallback(async (payload: MacroRecapRequest, note?: string, session: RecapSession = 'pm') => {
    setLoading(true);
    setError(null);
    try {
      const authSession = await getSupabase().auth.getSession();
      const token = authSession.data.session?.access_token;
      const res = await fetch('/.netlify/functions/macro-recap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...payload, session, ...(note?.trim() ? { note: note.trim() } : {}) }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const b = await res.json() as { error?: string }; if (b?.error) detail = b.error; } catch { /* non-JSON body */ }
        throw new Error(detail);
      }
      const data = await res.json() as MacroDailyRecap;
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      setRecap({ ...data, session, generatedAt: data.generatedAt ?? new Date().toISOString() });
      setRecapDate(today);
      setRecapSession(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate recap');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  return { recap, recapDate, recapSession, loading, error, loaded, generate };
}
