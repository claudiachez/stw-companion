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

interface PriceCacheState {
  cache: Record<string, Quote>;
  setPrice: (ticker: string, quote: Quote) => void;
}

export const usePriceCacheStore = create<PriceCacheState>((set) => ({
  cache: {},
  setPrice: (ticker, quote) =>
    set((s) => ({ cache: { ...s.cache, [ticker]: quote } })),
}));
