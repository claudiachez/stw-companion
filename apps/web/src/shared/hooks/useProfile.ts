import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@stw/ui';
import { supabase } from '../../lib/supabase';

export type ProfileStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  subscription_tier: string;
  status: ProfileStatus;
}

/**
 * Fetches (and upserts on first login) the current user's profile.
 * Use this when you need the raw status + tier, not just a boolean access check.
 */
export function useProfile() {
  const user = useAuthStore((s) => s.user);

  return useQuery<Profile | null>({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Try to read existing profile
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, email, subscription_tier, status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      // Profile doesn't exist yet (signed up before trigger was added) — create it
      if (!data) {
        const { data: inserted, error: insertErr } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            email: user.email ?? null,
            status: 'pending',
            subscription_tier: 'free',
          })
          .select('user_id, display_name, email, subscription_tier, status')
          .single();
        if (insertErr) throw insertErr;
        return inserted as Profile;
      }

      return data as Profile;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
