import { useQuery } from '@tanstack/react-query';
import { fetchHoldingTransactions, fetchConvictionComments } from './api';

export function useHoldingTransactions(ticker: string) {
  return useQuery({
    queryKey: ['transactions', ticker],
    queryFn: () => fetchHoldingTransactions(ticker),
    staleTime: 30_000,
    enabled: !!ticker,
  });
}

export function useConvictionComments(ticker: string) {
  return useQuery({
    queryKey: ['conviction-comments', ticker],
    queryFn: () => fetchConvictionComments(ticker),
    staleTime: 30_000,
    enabled: !!ticker,
  });
}
