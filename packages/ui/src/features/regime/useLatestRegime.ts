import { useQuery } from '@tanstack/react-query';
import { fetchLatestRegime } from './api';

export function useLatestRegime(instrument: string) {
  return useQuery({
    queryKey: ['regime-daily-latest', instrument],
    queryFn: () => fetchLatestRegime(instrument),
    staleTime: 5 * 60 * 1000,
  });
}
