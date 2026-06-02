import { usePriceCacheStore, type Quote } from '../store/priceCache';

export function useQuote(ticker: string): Quote | null {
  return usePriceCacheStore((s) => s.cache[ticker] ?? null);
}

export function useLivePrice(ticker: string): number | null {
  return usePriceCacheStore((s) => s.cache[ticker]?.c ?? null);
}
