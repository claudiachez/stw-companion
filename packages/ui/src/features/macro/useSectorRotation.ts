import { useState, useEffect, useRef } from 'react';
import { trendBucket, relativeStrength, RS_LOOKBACKS, SECTOR_ETFS } from '@stw/shared';
import type { SectorRotationRow } from '@stw/shared';
import { tdDailyCloses, loadCloses, loadLastDate, sma } from './maCache';

// Module 11: Sector Rotation. Reuses the Module 4 9/21/200 trend-bucket logic
// per sector, plus relative strength vs SPY across Week/1M/3M/6M/1Y. Needs the
// fullest daily-close history TwelveData's free tier allows (252 bars ≈ 1Y).
export function useSectorRotation(twelveDataKey?: string) {
  const [rows, setRows] = useState<SectorRotationRow[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function fetchAll() {
      const symbols = ['SPY', ...SECTOR_ETFS.map((s) => s.symbol)];
      const closesMap: Record<string, number[]> = {};
      await Promise.all(symbols.map(async (sym) => {
        closesMap[sym] = twelveDataKey ? await tdDailyCloses(sym, twelveDataKey, 252) : loadCloses(sym);
      }));

      if (cancelled) return;

      const spyCloses = closesMap.SPY ?? [];
      const result: SectorRotationRow[] = SECTOR_ETFS.map((meta) => {
        const closes = closesMap[meta.symbol] ?? [];
        const close = closes.length > 0 ? closes[closes.length - 1] : null;
        const ma9 = sma(closes, 9);
        const ma21 = sma(closes, 21);
        const ma200 = sma(closes, 200);
        return {
          symbol: meta.symbol,
          name: meta.name,
          close, ma9, ma21, ma200,
          bucket: trendBucket(close, ma9, ma21, ma200),
          rsWeek: relativeStrength(closes, spyCloses, RS_LOOKBACKS.week),
          rs1M: relativeStrength(closes, spyCloses, RS_LOOKBACKS.oneMonth),
          rs3M: relativeStrength(closes, spyCloses, RS_LOOKBACKS.threeMonth),
          rs6M: relativeStrength(closes, spyCloses, RS_LOOKBACKS.sixMonth),
          rs1Y: relativeStrength(closes, spyCloses, RS_LOOKBACKS.oneYear),
        };
      });

      if (!cancelled && mountedRef.current) {
        setRows(result);
        setAsOf(loadLastDate('SPY'));
        setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [twelveDataKey]);

  return { rows, asOf, loading };
}
