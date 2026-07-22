import { useEffect, useState } from 'react';
import { useCapabilities } from '../../context/AppCapabilities';

// Recent intraday closing prices for SPY + QQQ, for the Today's-setups mini-sparklines.
// Same real source the (now-removed) live chart used — TwelveData 15-min bars — so the path
// each setup draws is genuine price action, never a fabricated wiggle. Empty arrays when
// there's no key or the fetch fails, in which case the row simply renders without a spark.
export interface SignalCloses {
  SPY: number[];
  QQQ: number[];
}

const EMPTY: SignalCloses = { SPY: [], QQQ: [] };

async function fetchCloses(symbol: string, key: string): Promise<number[]> {
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}`
    + `&interval=15min&outputsize=26&timezone=UTC&apikey=${key}`;
  try {
    const data = await (await fetch(url)).json();
    if (data.status !== 'ok' || !Array.isArray(data.values)) return [];
    // TwelveData returns newest-first — reverse to chronological for a left→right spark.
    return [...data.values]
      .reverse()
      .map((v: Record<string, string>) => parseFloat(v.close))
      .filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

export function useSignalCloses(): SignalCloses {
  const { twelveDataKey } = useCapabilities();
  const [closes, setCloses] = useState<SignalCloses>(EMPTY);

  useEffect(() => {
    const key = twelveDataKey?.trim();
    if (!key) { setCloses(EMPTY); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      const [SPY, QQQ] = await Promise.all([fetchCloses('SPY', key), fetchCloses('QQQ', key)]);
      if (!cancelled) setCloses({ SPY, QQQ });
    };

    run();
    timer = setInterval(run, 60_000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [twelveDataKey]);

  return closes;
}
