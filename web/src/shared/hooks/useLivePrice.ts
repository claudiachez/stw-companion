import { useEffect, useState } from 'react';

const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY as string | undefined;

export function useLivePrice(ticker: string): number | null {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!ticker || !FINNHUB_KEY) return;

    const ws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', symbol: ticker }));
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data as string);
      if (data.type === 'trade' && data.data?.length) {
        const last = data.data[data.data.length - 1] as { p: number };
        setPrice(last.p);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', symbol: ticker }));
      }
      ws.close();
    };
  }, [ticker]);

  return price;
}
