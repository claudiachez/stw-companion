import { useEffect, useState } from 'react';
import { useCapabilities } from '../../context/AppCapabilities';
import { liveQuotesCached } from '../macro/maCache';
import { useLatestRegime } from './useLatestRegime';

// The regime gate, live. Same daily `regime_daily` row (sma200 + VIX — VIX has no free
// intraday feed, and a moving average is fixed intraday anyway), but the instrument's
// `close` is overlaid with the LIVE quote — from the SAME stw-price-cache the Macro Trend
// table reads, so the gate's price leg agrees with the live structure buckets to the tick.
// Result: the market-health lights + the sizing multiplier react intraday the moment the
// index breaches its 200-day, instead of at the next close (host, 2026-07-23).
export function useLatestRegimeLive(instrument: string) {
  const q = useLatestRegime(instrument);
  const { finnhubKey } = useCapabilities();
  const [liveClose, setLiveClose] = useState<number | null>(null);

  useEffect(() => {
    if (!finnhubKey) { setLiveClose(null); return; }
    let cancelled = false;
    const run = async () => {
      const m = await liveQuotesCached([instrument], finnhubKey);
      if (!cancelled) setLiveClose(m[instrument] ?? null);
    };
    run();
    const timer = setInterval(run, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [instrument, finnhubKey]);

  const data = q.data
    ? { ...q.data, close: liveClose != null && liveClose > 0 ? liveClose : q.data.close }
    : q.data;
  return { ...q, data };
}
