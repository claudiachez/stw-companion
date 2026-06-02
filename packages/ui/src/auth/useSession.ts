import { useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';

export function useSession() {
  const { setSession, setLoading } = useAuthStore();

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [setSession, setLoading]);
}
