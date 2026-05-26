import { create } from 'zustand';

export interface Quote {
  c: number;   // current price
  pc: number;  // previous close
  dp: number;  // day change %
  h: number;   // high
  l: number;   // low
  o: number;   // open
  t: number;   // unix timestamp
}

export type PriceFetchStatus = 'idle' | 'fetching' | 'done' | 'error';

interface PriceCacheState {
  cache: Record<string, Quote>;
  fetchStatus: PriceFetchStatus;
  setPrice: (ticker: string, quote: Quote) => void;
  setFetchStatus: (s: PriceFetchStatus) => void;
}

export const usePriceCacheStore = create<PriceCacheState>((set) => ({
  cache: {},
  fetchStatus: 'idle',
  setPrice: (ticker, quote) =>
    set((s) => ({ cache: { ...s.cache, [ticker]: quote } })),
  setFetchStatus: (fetchStatus) => set({ fetchStatus }),
}));
