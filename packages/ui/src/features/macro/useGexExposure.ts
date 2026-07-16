import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

// Reads the latest GEX snapshot (SPX) from Supabase (`gex_snapshots`, migration
// 067), written twice each weekday by the `gex-snapshot` Netlify scheduled fn
// from the SPX Gamma Edge newsletter's public RSS feed. The browser never hits
// the feed — a scheduled writer + a Supabase read keeps one canonical row.

export interface GexExposureRead {
  symbol: string;
  spot: number | null;
  gammaFlip: number | null;
  netGex: number | null;
  netGexLabel: 'positive' | 'negative' | null;
  callWall: number | null;
  putWall: number | null;
  sleeveScore: number | null;
  asOf: string | null;
  session: string | null;
}

interface SnapshotRow {
  symbol: string;
  underlying_price: number | null;
  gamma_flip: number | null;
  net_gex: number | null;
  net_gex_label: 'positive' | 'negative' | null;
  call_wall: number | null;
  put_wall: number | null;
  sleeve_score: number | null;
  as_of: string | null;
  session: string | null;
}

export function useGexExposure(): { data: GexExposureRead | null; loading: boolean } {
  const [data, setData] = useState<GexExposureRead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .from('gex_snapshots')
      .select('symbol, underlying_price, gamma_flip, net_gex, net_gex_label, call_wall, put_wall, sleeve_score, as_of, session, snapshot_date')
      .eq('symbol', 'SPX')
      .order('snapshot_date', { ascending: false })
      .order('session', { ascending: false }) // 'pm' sorts after 'am' → latest session of the day
      .limit(1)
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        const r = (rows as SnapshotRow[] | null)?.[0];
        if (!error && r) {
          setData({
            symbol: r.symbol,
            spot: r.underlying_price,
            gammaFlip: r.gamma_flip,
            netGex: r.net_gex,
            netGexLabel: r.net_gex_label,
            callWall: r.call_wall,
            putWall: r.put_wall,
            sleeveScore: r.sleeve_score,
            asOf: r.as_of,
            session: r.session,
          });
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
