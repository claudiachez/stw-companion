import { useQuery } from '@tanstack/react-query';
import { fetchUserPositions, fetchUserExecutions, fetchIbkrSettings, fetchIbkrAccount } from './api';
import type { UserPosition, UserExecution, IbkrSettings } from './api';
import { useAuthStore } from '../../store/auth';

export function useUserPositions(): ReturnType<typeof useQuery<UserPosition[]>> {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery<UserPosition[]>({
    queryKey: ['user-positions', userId],
    queryFn: () => fetchUserPositions(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUserExecutions(): ReturnType<typeof useQuery<UserExecution[]>> {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery<UserExecution[]>({
    queryKey: ['user-executions', userId],
    queryFn: () => fetchUserExecutions(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useIbkrSettings(): ReturnType<typeof useQuery<IbkrSettings>> {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery<IbkrSettings>({
    queryKey: ['ibkr-settings', userId],
    queryFn: () => fetchIbkrSettings(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useIbkrAccount(): ReturnType<typeof useQuery<string | null>> {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery<string | null>({
    queryKey: ['ibkr-account', userId],
    queryFn: () => fetchIbkrAccount(userId!),
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
  });
}
