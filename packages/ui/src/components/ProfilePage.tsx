import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { LoadingSpinner } from '../primitives/LoadingSpinner';
import { StatusPill, type StatusPillVariant } from '../primitives/StatusPill';
import { AlertStrip } from '../primitives/AlertStrip';
import { usePicksTabStore, coercePicksTab, PICKS_TABS, PICKS_TAB_LABELS, type PicksTab } from '../features/picks/usePicksTab';

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  basic: 'Basic',
  premium: 'Premium',
};

// 'pending' reads as `unevaluated`, not a caution/warning variant — an approval decision
// hasn't happened yet, which is closer to "no verdict yet" than "approaching a breach."
// Same mapping as apps/admin/src/features/users/UsersPage.tsx's STATUS_VARIANT.
const STATUS_VARIANT: Record<string, StatusPillVariant> = {
  pending: 'unevaluated',
  approved: 'ok',
  rejected: 'breach',
};

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const defaultTab = usePicksTabStore((s) => s.defaultTab);
  const setDefaultTab = usePicksTabStore((s) => s.setDefaultTab);

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
              <StatusPill variant={STATUS_VARIANT[profile.status] ?? STATUS_VARIANT.pending}>
                {profile.status}
              </StatusPill>
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
          <AlertStrip severity="warning">
            Your account is pending approval. You'll gain access to content once approved.
          </AlertStrip>
        )}

        {profile?.status === 'rejected' && (
          <AlertStrip severity="negative">
            Your account request was not approved. Contact support for more information.
          </AlertStrip>
        )}
      </div>

      {/* Preferences */}
      <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4 mt-4">
        <div className="text-text font-semibold text-sm">Preferences</div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-text text-sm">Default Stock Picks tab</div>
            <div className="text-t3 text-xs mt-0.5">Which sub-tab opens first on the Stock Picks page.</div>
          </div>
          <select
            value={coercePicksTab(defaultTab)}
            onChange={(e) => setDefaultTab(e.target.value as PicksTab)}
            className="bg-s2 border border-border rounded-lg px-3 py-2 text-text text-sm"
          >
            {PICKS_TABS.map((t) => (
              <option key={t} value={t}>{PICKS_TAB_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
