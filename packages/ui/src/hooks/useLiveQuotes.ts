import { useEffect } from 'react';
import { usePriceCacheStore, type Quote } from '../store/priceCache';

const PRICE_CACHE_KEY = 'finnhub_prices';
const PRICE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

type PriceEntry = { data: Quote; ts: number };
type LocalPriceCache = Record<string, PriceEntry>;

function loadLocalPrices(): LocalPriceCache {
  try { return JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) ?? '{}'); } catch { return {}; }
}
function saveLocalPrices(c: LocalPriceCache) {
  try { localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(c)); } catch { /* storage full */ }
}

/**
 * Populate the shared Finnhub price cache (the one decided source for live equity
 * quotes) for `tickers`. Seeds from localStorage immediately so prices show before any
 * network call, then staggers fetches (~1.1s apart → under the free-tier 60/min cap) for
 * anything stale or missing. Used by every surface that shows live prices — Stock Picks
 * AND My Portfolio — so there's ONE fetch path + cache, not a per-page copy (this was
 * inline in PicksView, which is why My Portfolio showed the stored IBKR mark instead).
 */
export function useLiveQuotes(tickers: string[], finnhubKey?: string): void {
  const setPrice = usePriceCacheStore((s) => s.setPrice);
  const setFetchStatus = usePriceCacheStore((s) => s.setFetchStatus);
  // Join to a stable key so a new-array-identity render doesn't re-run the fetch.
  const key = tickers.join(',');

  useEffect(() => {
    if (!finnhubKey || tickers.length === 0) return;

    const now = Date.now();
    const local = loadLocalPrices();

    // Seed from localStorage immediately — UI shows prices before any fetch.
    tickers.forEach((ticker) => {
      const entry = local[ticker];
      if (entry && now - entry.ts < PRICE_CACHE_TTL) setPrice(ticker, entry.data);
    });

    // Only fetch tickers whose cache expired or is missing.
    const stale = tickers.filter((t) => {
      const e = local[t];
      return !e || now - e.ts >= PRICE_CACHE_TTL;
    });
    if (stale.length === 0) { setFetchStatus('done'); return; }

    setFetchStatus('fetching');
    let completed = 0;
    stale.forEach((ticker, i) => {
      // ~1.1s stagger → ~54 req/min, safely under Finnhub free-tier 60/min.
      setTimeout(() => {
        fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubKey}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.c) {
              setPrice(ticker, d);
              local[ticker] = { data: d, ts: now };
              saveLocalPrices(local);
            } else if (d.error) {
              console.warn(`Finnhub [${ticker}]:`, d.error);
            }
          })
          .catch((err) => console.error(`Finnhub fetch failed [${ticker}]:`, err))
          .finally(() => { if (++completed === stale.length) setFetchStatus('done'); });
      }, i * 1100);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setPrice, setFetchStatus, finnhubKey]);
}
