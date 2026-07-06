import { useState, useEffect, useRef } from 'react';
import { trendBucket, relativeStrength, RS_LOOKBACKS, SECTOR_ETFS, SECTOR_CONSTITUENTS, rankSectorConstituents } from '@stw/shared';
import type { SectorRotationRow } from '@stw/shared';
import { loadCloses, loadLastDate, sma, tdBatchCloses, fetchClosesChunked } from './maCache';

export interface SectorConstituents {
  leaders: SectorRotationRow[];
  settingUp: SectorRotationRow[];
}

function buildRow(meta: { symbol: string; name: string }, closes: number[], spyCloses: number[]): SectorRotationRow {
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
}

// Module 11: Sector Rotation. Reuses the Module 4 9/21/200 trend-bucket logic
// per sector, plus relative strength vs SPY across Week/1M/3M/6M/1Y. Needs the
// fullest daily-close history TwelveData's free tier allows (252 bars ≈ 1Y).
//
// `skipConstituents` lets a caller that only needs the 12 sector-level rows (e.g.
// the Picks tab's per-ticker regime badge — see useTickerRegime.ts) opt out of the
// ~66-symbol constituent fetch used only for this module's own Leaders/Setting Up
// stock chips. Without this, every Picks tab visit would also trigger that fetch
// and compete with it for TwelveData's free-tier rate limit.
export function useSectorRotation(twelveDataKey?: string, skipConstituents = false) {
  const [rows, setRows] = useState<SectorRotationRow[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [constituents, setConstituents] = useState<Record<string, SectorConstituents>>({});
  const [constituentsLoading, setConstituentsLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setConstituentsLoading(true);

    async function fetchAll() {
      const symbols = ['SPY', ...SECTOR_ETFS.map((s) => s.symbol)];
      // 12 ETFs via tdBatchCloses, which chunks + paces internally to respect
      // the free tier's 8-credit/min cap (1 credit per symbol, not per call).
      const closesMap: Record<string, number[]> = twelveDataKey
        ? await tdBatchCloses(symbols, twelveDataKey, 252)
        : Object.fromEntries(symbols.map((sym) => [sym, loadCloses(sym)]));

      if (cancelled) return;

      const spyCloses = closesMap.SPY ?? [];
      const result = SECTOR_ETFS.map((meta) => buildRow(meta, closesMap[meta.symbol] ?? [], spyCloses));

      if (!cancelled && mountedRef.current) {
        setRows(result);
        setAsOf(loadLastDate('SPY'));
        setLoading(false);
      }

      if (skipConstituents) {
        if (!cancelled && mountedRef.current) setConstituentsLoading(false);
        return;
      }

      // Leaders / Setting Up draw from each sector's own constituent stocks (not
      // STW's holdings) — ~6x more symbols than the rows above, so this is fetched
      // separately in small chunks to stay under TwelveData's free-tier rate limit
      // rather than blocking (or starving) the main sector view.
      const constituentSymbols = SECTOR_ETFS.flatMap((s) => (SECTOR_CONSTITUENTS[s.symbol] ?? []).map((c) => c.symbol));
      const constituentCloses = twelveDataKey
        ? await fetchClosesChunked(constituentSymbols, twelveDataKey, 252)
        : Object.fromEntries(constituentSymbols.map((sym) => [sym, loadCloses(sym)]));

      if (cancelled) return;

      const constituentResult: Record<string, SectorConstituents> = {};
      for (const sector of SECTOR_ETFS) {
        const sectorRows = (SECTOR_CONSTITUENTS[sector.symbol] ?? [])
          .map((meta) => buildRow(meta, constituentCloses[meta.symbol] ?? [], spyCloses));
        constituentResult[sector.symbol] = rankSectorConstituents(sectorRows);
      }

      if (!cancelled && mountedRef.current) {
        setConstituents(constituentResult);
        setConstituentsLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [twelveDataKey, skipConstituents]);

  return { rows, asOf, loading, constituents, constituentsLoading };
}
