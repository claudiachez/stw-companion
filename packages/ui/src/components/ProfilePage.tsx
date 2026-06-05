import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { LoadingSpinner } from '../primitives/LoadingSpinner';

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  basic: 'Basic',
  premium: 'Premium',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-[#f59e0b] bg-[#f59e0b15] border-[#f59e0b22]',
  approved: 'text-[#22c55e] bg-[#22c55e15] border-[#22c55e22]',
  rejected: 'text-[#ef4444] bg-[#ef444415] border-[#ef444422]',
};

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-s2 flex items-center justify-center text-xl font-bold text-acc">
            {(profile?.display_name ?? user?.email ?? '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="text-text font-semibold">{profile?.display_name ?? '—'}</div>
            <div className="text-t2 text-sm">{user?.email}</div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-s2 rounded-lg p-3">
            <div className="text-t3 text-xs mb-1">Account Status</div>
            {profile ? (
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border capitalize ${
                  STATUS_STYLES[profile.status] ?? STATUS_STYLES['pending']
                }`}
              >
                {profile.status}
              </span>
            ) : (
              <span className="text-t3 text-xs">—</span>
            )}
          </div>
          <div className="bg-s2 rounded-lg p-3">
            <div className="text-t3 text-xs mb-1">Subscription Tier</div>
            <div className="text-text text-sm font-medium">
              {profile ? (TIER_LABELS[profile.subscription_tier] ?? profile.subscription_tier) : '—'}
            </div>
          </div>
        </div>

        {profile?.status === 'pending' && (
          <div className="bg-[#f59e0b10] border border-[#f59e0b22] rounded-lg p-3 text-[#f59e0b] text-sm">
            Your account is pending approval. You'll gain access to content once approved.
          </div>
        )}

        {profile?.status === 'rejected' && (
          <div className="bg-[#ef444410] border border-[#ef444422] rounded-lg p-3 text-[#ef4444] text-sm">
            Your account request was not approved. Contact support for more information.
          </div>
        )}
      </div>
    </div>
  );
}
