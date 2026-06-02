import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@stw/ui';
import { supabase } from '../../lib/supabase';

export function useTierAccess(module: string): boolean {
  const user = useAuthStore((s) => s.user);

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, status')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tier } = useQuery({
    queryKey: ['tier', profile?.subscription_tier],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tiers')
        .select('modules')
        .eq('id', profile!.subscription_tier)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile && profile.status === 'approved',
    staleTime: 10 * 60 * 1000,
  });

  if (!profile || profile.status !== 'approved') return false;
  return (tier?.modules as string[] | undefined)?.includes(module) ?? false;
}
