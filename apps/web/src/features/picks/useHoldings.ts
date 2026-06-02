import { useQuery } from '@tanstack/react-query';
import { fetchHoldings } from './api';

export function useHoldings() {
  return useQuery({
    queryKey: ['holdings'],
    queryFn: fetchHoldings,
    staleTime: 60 * 1000,
  });
}
