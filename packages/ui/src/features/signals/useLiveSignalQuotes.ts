import { useEffect, useState } from 'react';
import { useCapabilities } from '../../context/AppCapabilities';

// Live SPY + QQQ quotes (Finnhub) for the Signals level cards' "Current Price".
// The Graddox report ships a spot AS OF the report; showing that here while the
// Macro GEX card shows a live spot meant two different "current SPX" numbers on
// the platform. Both now read the same live Finnhub source (one value, one
// source). Polls every 60s; null (→ the card falls back to the report spot) when
// there's no key or the quote is unavailable.
export interface LiveSignalQuotes {
  spy: number | null;
  qqq: number | null;
  at: number | null; // ms epoch of the quote
}

export function useLiveSignalQuotes(): LiveSignalQuotes {
  const { finnhubKey } = useCapabilities();
  const [q, setQ] = useState<LiveSignalQuotes>({ spy: null, qqq: null, at: null });

  useEffect(() => {
    if (!finnhubKey) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      try {
        const [s, n] = await Promise.all([
          fetch(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${finnhubKey}`).then((r) => r.json()),
          fetch(`https://finnhub.io/api/v1/quote?symbol=QQQ&token=${finnhubKey}`).then((r) => r.json()),
        ]) as [{ c?: number; t?: number }, { c?: number }];
        if (cancelled) return;
        setQ({
          spy: typeof s.c === 'number' && s.c > 0 ? s.c : null,
          qqq: typeof n.c === 'number' && n.c > 0 ? n.c : null,
          at: (s.t ?? Math.floor(Date.now() / 1000)) * 1000,
        });
      } catch { /* keep last good value; the card falls back to the report spot */ }
    };

    run();
    timer = setInterval(run, 60_000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [finnhubKey]);

  return q;
}
