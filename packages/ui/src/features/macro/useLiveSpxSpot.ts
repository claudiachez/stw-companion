import { useEffect, useState } from 'react';
import { useCapabilities } from '../../context/AppCapabilities';

// Live SPX spot, proxied from a Finnhub SPY quote (SPX ≈ SPY × 10 — the same
// scaling the Signals page uses via scale10). The Macro GEX card shows this as
// its "Spot" so it reconciles with the live price on the Signals page rather
// than the stale premarket "implied open" the newsletter reports. Polls every
// 60s. Returns null (→ the card falls back to the report spot) when there's no
// Finnhub key or the quote is unavailable.
//
// Finnhub returns the last trade when the market is closed, so after hours /
// weekends this is the most recent close — still more current than a premarket
// figure.

export interface LiveSpot {
  /** SPX-scaled spot (live SPY × 10). */
  spx: number;
  /** Quote timestamp (ms epoch) reported by Finnhub. */
  at: number;
}

export function useLiveSpxSpot(): LiveSpot | null {
  const { finnhubKey } = useCapabilities();
  const [spot, setSpot] = useState<LiveSpot | null>(null);

  useEffect(() => {
    if (!finnhubKey) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchSpot = async () => {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${finnhubKey}`);
        const q = await res.json() as { c?: number; t?: number };
        if (!cancelled && typeof q.c === 'number' && q.c > 0) {
          setSpot({ spx: +(q.c * 10).toFixed(2), at: (q.t ?? Math.floor(Date.now() / 1000)) * 1000 });
        }
      } catch { /* keep the last good value; the card falls back to the report spot */ }
    };

    fetchSpot();
    timer = setInterval(fetchSpot, 60_000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [finnhubKey]);

  return spot;
}
