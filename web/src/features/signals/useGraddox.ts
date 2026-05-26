import { useQuery } from '@tanstack/react-query';
import { fetchGraddox } from './api';

export function useGraddox() {
  return useQuery({
    queryKey: ['graddox'],
    queryFn: fetchGraddox,
    staleTime: 2 * 60 * 1000,
  });
}
