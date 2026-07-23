import { useEffect, useState } from 'react';
import { trendStructure, mapIndustryToSector, sectorStanding } from '@stw/shared';
import type { TrendBucket, SectorStanding } from '@stw/shared';
import { loadCloses, tdBatchCloses, liveQuotesCached } from '../macro/maCache';
import { useSectorRotation } from '../macro/useSectorRotation';

export interface TickerRegime {
  bucket: TrendBucket | null;
  sectorSymbol: string | null;
  sectorName: string | null;
  standing: SectorStanding | null;
  /** Latest close + the 9/21/200-day SMAs behind the bucket (for a detailed read). */
  close: number | null;
  ma9: number | null;
  ma21: number | null;
  ma200: number | null;
}

// Sector classification barely ever changes for a given ticker, so it's cached
// far longer than the daily MA cache in maCache.ts (30 days vs. 24h).
const SECTOR_CACHE_PREFIX = 'ticker-sector-';
const SECTOR_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

function loadCachedSector(ticker: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(SECTOR_CACHE_PREFIX + ticker);
    if (!raw) return undefined;
    const d = JSON.parse(raw) as { sector: string | null; ts: number };
    if (Date.now() - d.ts > SECTOR_CACHE_TTL) return undefined;
    return d.sector;
  } catch { return undefined; }
}

function saveCachedSector(ticker: string, sector: string | null) {
  try { localStorage.setItem(SECTOR_CACHE_PREFIX + ticker, JSON.stringify({ sector, ts: Date.now() })); }
  catch { /* ignore */ }
}

async function fetchIndustry(ticker: string, finnhubKey: string): Promise<string | null> {
  try {
    const d = await (await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${finnhubKey}`)).json();
    return d?.finnhubIndustry ?? null;
  } catch { return null; }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Per-ticker regime badge data: the ticker's own 9/21/200 trend bucket, plus its
 * sector's current Leader / Setting Up / Laggard standing — reusing the Sector
 * Rotation module's already-computed sector rows (see macro_dashboard_spec.md)
 * rather than a hand-maintained STW-basket → sector mapping. Sector classification
 * comes from Finnhub's company-profile industry field, normalized via
 * `mapIndustryToSector` and cached long-term per ticker (sector rarely changes).
 */
export function useTickerRegime(tickers: string[], finnhubKey?: string, twelveDataKey?: string) {
  // skipConstituents: this hook only needs the 12 sector-level rows, not Sector
  // Rotation's own ~66-symbol constituent fetch (used only for its Leaders/Setting
  // Up stock chips) — pulling that in here would double up on TwelveData's rate limit.
  const { rows: sectorRows, loading: sectorsLoading } = useSectorRotation(twelveDataKey, true);
  const [regimes, setRegimes] = useState<Record<string, TickerRegime>>({});
  const [loading, setLoading] = useState(true);

  const tickerKey = tickers.join(',');

  useEffect(() => {
    if (tickers.length === 0) { setRegimes({}); setLoading(false); return; }
    if (sectorsLoading) return; // wait for sector rows once, rather than computing twice
    let cancelled = false;
    setLoading(true);

    async function run() {
      // Trend bucket: one batched TwelveData call for every held ticker (same
      // pattern useSectorRotation uses for the 11 sector ETFs).
      const closesMap = twelveDataKey
        ? await tdBatchCloses(tickers, twelveDataKey, 252)
        : Object.fromEntries(tickers.map((t) => [t, loadCloses(t)]));
      if (cancelled) return;

      // Sector classification: cached per-ticker; only uncached tickers hit
      // Finnhub, staggered to stay under the free-tier ~60 req/min limit.
      if (finnhubKey) {
        const toFetch = tickers.filter((t) => loadCachedSector(t) === undefined);
        for (let i = 0; i < toFetch.length; i++) {
          if (cancelled) return;
          const industry = await fetchIndustry(toFetch[i], finnhubKey);
          saveCachedSector(toFetch[i], mapIndustryToSector(industry));
          if (i < toFetch.length - 1) await delay(1100);
        }
      }
      // Live prices so the per-ticker bucket classifies off the live quote vs the fixed daily
      // MAs — identical criteria to the Macro Trend table + the regime gate (host, 2026-07-23).
      const live = await liveQuotesCached(tickers, finnhubKey);
      if (cancelled) return;

      const sectorRowBySymbol = Object.fromEntries(sectorRows.map((r) => [r.symbol, r]));
      const result: Record<string, TickerRegime> = {};
      for (const t of tickers) {
        const closes = closesMap[t] ?? [];
        const { close, ma9, ma21, ma200, bucket } = trendStructure(closes, live[t]);
        const sectorSymbol = loadCachedSector(t) ?? null;
        const sectorRow = sectorSymbol ? sectorRowBySymbol[sectorSymbol] : undefined;
        result[t] = {
          bucket,
          sectorSymbol,
          sectorName: sectorRow?.name ?? null,
          standing: sectorRow ? sectorStanding(sectorRow.bucket) : null,
          close, ma9, ma21, ma200,
        };
      }
      if (!cancelled) { setRegimes(result); setLoading(false); }
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey, finnhubKey, twelveDataKey, sectorsLoading]);

  return { regimes, loading: loading || sectorsLoading };
}
