import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth';

interface SyncResult {
  count: number;
  /** Executions (fills) appended to user_executions this sync. 0 until the operator
   * enables the Flex Trades section — the append-only log grows across syncs. */
  executions: number;
  lastSyncedAt: string;
  /** The IBKR account the Flex Query resolved to — lets a save-time verification
   * echo a concrete fact instead of a bare position count. */
  accountId: string | null;
}

export function useSyncPortfolio() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const userId = useAuthStore((s) => s.user?.id);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  async function sync() {
    if (!session?.access_token) {
      setSyncError('Not signed in');
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/.netlify/functions/ibkr-flex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setLastResult({ count: json.count, executions: json.executions ?? 0, lastSyncedAt: json.lastSyncedAt, accountId: json.accountId ?? null });
      await queryClient.invalidateQueries({ queryKey: ['user-positions', userId] });
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }

  return { sync, isSyncing, syncError, lastResult };
}
