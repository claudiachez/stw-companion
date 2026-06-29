import { useQuery } from '@tanstack/react-query';
import { fetchGraddox, fetchLastMorningRun } from './api';

export function useGraddox() {
  return useQuery({
    queryKey: ['graddox'],
    queryFn: fetchGraddox,
    staleTime: 2 * 60 * 1000,
  });
}

export function useLastMorningRun() {
  return useQuery({
    queryKey: ['run-log-latest-morning'],
    queryFn: fetchLastMorningRun,
    staleTime: 5 * 60 * 1000,
  });
}
