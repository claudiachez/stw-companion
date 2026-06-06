import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LoadingSpinner, EmptyState } from '@stw/ui';
import { supabase } from '../../lib/supabase';

type Status = 'pending' | 'approved' | 'rejected';

interface ProfileRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  subscription_tier: string;
  status: Status;
  created_at: string | null;
}

interface Tier {
  id: string;
  label: string;
}

const STATUS_STYLES: Record<Status, string> = {
  pending: 'text-[#f59e0b] bg-[#f59e0b15] border-[#f59e0b33]',
  approved: 'text-[#22c55e] bg-[#22c55e15] border-[#22c55e33]',
  rejected: 'text-[#ef4444] bg-[#ef444415] border-[#ef444433]',
};

export function UsersPage() {
  const queryClient = useQueryClient();

  const { data: profiles, isLoading } = useQuery<ProfileRow[]>({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, email, display_name, subscription_tier, status, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ProfileRow[];
    },
  });

  const { data: tiers = [] } = useQuery<Tier[]>({
    queryKey: ['tiers-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tiers').select('id, label').order('id');
      if (error) throw error;
      return data as Tier[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const update = useMutation({
    mutationFn: async ({ userId, patch }: { userId: string; patch: Partial<ProfileRow> }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-profiles'] }),
  });

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (!profiles?.length) return <EmptyState message="No users yet" />;

  return (
    <div className="flex-1 overflow-auto px-4 py-6">
      <div className="max-w-4xl mx-auto">
        {/* No page title — the active nav tab is context (matches Picks/Signals). */}
        <p className="text-t3 text-xs mb-4">{profiles.length} user{profiles.length === 1 ? '' : 's'}</p>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-t3 text-xs uppercase tracking-wide border-b border-border">
                <th className="text-left font-medium px-4 py-3">User</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Tier</th>
                <th className="text-right font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.user_id} className="border-b border-bsub last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-text">{p.display_name ?? '—'}</div>
                    <div className="text-t3 text-xs">{p.email ?? p.user_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border capitalize ${STATUS_STYLES[p.status]}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={p.subscription_tier}
                      onChange={(e) =>
                        update.mutate({ userId: p.user_id, patch: { subscription_tier: e.target.value } })
                      }
                      className="bg-s2 border border-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-acc"
                    >
                      {tiers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      {p.status !== 'approved' && (
                        <button
                          onClick={() => update.mutate({ userId: p.user_id, patch: { status: 'approved' } })}
                          className="px-2.5 py-1 rounded text-xs font-medium border border-[#22c55e33] text-[#22c55e] hover:bg-[#22c55e15] transition-colors"
                        >
                          Approve
                        </button>
                      )}
                      {p.status !== 'rejected' && (
                        <button
                          onClick={() => update.mutate({ userId: p.user_id, patch: { status: 'rejected' } })}
                          className="px-2.5 py-1 rounded text-xs font-medium border border-[#ef444433] text-[#ef4444] hover:bg-[#ef444415] transition-colors"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
