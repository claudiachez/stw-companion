import { useQuery } from '@tanstack/react-query';
import { fetchHoldingTransactions, fetchAllTransactions, fetchConvictionComments } from './api';

export function useHoldingTransactions(ticker: string) {
  return useQuery({
    queryKey: ['transactions', ticker],
    queryFn: () => fetchHoldingTransactions(ticker),
    staleTime: 30_000,
    enabled: !!ticker,
  });
}

// Every transaction across all tickers — feeds the global Transaction Ledger.
export function useAllTransactions() {
  return useQuery({
    queryKey: ['all-transactions'],
    queryFn: fetchAllTransactions,
    staleTime: 60_000,
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
