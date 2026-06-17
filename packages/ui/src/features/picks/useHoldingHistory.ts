import { useQuery } from '@tanstack/react-query';
import { fetchConvictionComments, fetchLegTransactions } from './api';

// The position's evolution timeline — every leg event (open/trim/close/…) for the ticker, from the
// same source (`leg_transactions`) the legs derive from, so the timeline + legs can't disagree.
export function useLegTransactions(ticker: string) {
  return useQuery({
    queryKey: ['leg-transactions', ticker],
    queryFn: () => fetchLegTransactions(ticker),
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
