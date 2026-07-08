import { useEffect, useMemo, useState } from 'react';
import { classifyTrendDirection } from '@stw/shared';
import type { TrendDirection } from '@stw/shared';
import { getSupabase } from '../../lib/supabase';

// ── P2: 5D Trend Engine ──────────────────────────────────────────────
// Reads the server-written `macro_daily_snapshots` table (migration 048,
// one row per weekday, written by the macro-snapshot scheduled Netlify
// function at 4:30pm ET) and computes 5D/20D deltas + a direction
// classification off it, using today's live sleeve scores as the current
// point.
//
// This used to keep a per-browser localStorage history — but localStorage is
// scoped per domain, so the subscriber web site and the admin site accumulated
// DIFFERENT histories and showed different regime-direction descriptors and
// 5D deltas for the same market (the "Macro differs in app vs admin" bug,
// 2026-07-07). A shared Supabase source makes every device/site agree.
//
// "N trading days ago" is approximated as "N snapshot-rows ago" (i.e. the Nth
// most recent weekday a snapshot was written) rather than N calendar days —
// close enough for a tool used on market days, and avoids needing a holiday
// calendar. Deltas are legitimately null until enough rows accrue.

const HISTORY_LIMIT = 40; // covers the 20-trading-day lookback + buffer

export type ModuleSleeveKey =
  | 'regime' | 'trend' | 'volatility' | 'credit' | 'rates_dollar' | 'gex' | 'risk_appetite';

interface SnapshotRow {
  snapshot_date: string;
  module_scores: Partial<Record<ModuleSleeveKey, number | null>> | null;
  indicator_scores: Record<string, number | null> | null;
}

export interface TrendHistoryEntry {
  current: number | null;
  /** GEX changes fast (spec Module 8/2) — tracked alongside the 5D delta everyone else uses. */
  threeDayDelta: number | null;
  fiveDayDelta: number | null;
  twentyDayDelta: number | null;
  direction: TrendDirection;
}

const NULL_ENTRY: TrendHistoryEntry = {
  current: null, threeDayDelta: null, fiveDayDelta: null, twentyDayDelta: null, direction: 'flat',
};

function todayStr(): string {
  // ET calendar day, matching the snapshot writer's snapshot_date.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function entryAt(history: (number | null)[], lookback: number): number | null {
  const idx = history.length - 1 - lookback;
  return idx >= 0 ? history[idx] : null;
}

/** history is oldest → newest; the last element is the current point. */
function buildEntry(history: (number | null)[]): TrendHistoryEntry {
  if (history.length === 0) return NULL_ENTRY;
  const current = history[history.length - 1];
  const threeAgo = entryAt(history, 3);
  const fiveAgo = entryAt(history, 5);
  const tenAgo = entryAt(history, 10);
  const twentyAgo = entryAt(history, 20);

  const threeDayDelta = current !== null && threeAgo !== null ? current - threeAgo : null;
  const fiveDayDelta = current !== null && fiveAgo !== null ? current - fiveAgo : null;
  const priorFiveDayDelta = fiveAgo !== null && tenAgo !== null ? fiveAgo - tenAgo : null;
  const twentyDayDelta = current !== null && twentyAgo !== null ? current - twentyAgo : null;

  return {
    current,
    threeDayDelta,
    fiveDayDelta,
    twentyDayDelta,
    direction: classifyTrendDirection(fiveDayDelta, priorFiveDayDelta),
  };
}

export interface MacroTrendHistoryInput {
  regime: number | null;
  trend: number | null;
  volatility: number | null;
  credit: number | null;
  ratesDollar: number | null;
  gex: number | null;
  riskAppetite: number | null;
  indicators: { symbol: string; score: number | null }[];
  /** Don't fold in today's live point until the day's scores have actually settled. */
  ready: boolean;
}

export interface MacroTrendHistoryResult {
  deltas: Record<ModuleSleeveKey, TrendHistoryEntry>;
  indicatorDeltas: Record<string, TrendHistoryEntry>;
}

const SLEEVE_KEYS: ModuleSleeveKey[] = ['regime', 'trend', 'volatility', 'credit', 'rates_dollar', 'gex', 'risk_appetite'];

const EMPTY_RESULT: MacroTrendHistoryResult = {
  deltas: Object.fromEntries(SLEEVE_KEYS.map((k) => [k, NULL_ENTRY])) as Record<ModuleSleeveKey, TrendHistoryEntry>,
  indicatorDeltas: {},
};

export function useMacroTrendHistory(input: MacroTrendHistoryInput): MacroTrendHistoryResult {
  const {
    ready, regime, trend, volatility, credit, ratesDollar, gex, riskAppetite, indicators,
  } = input;
  const indicatorsKey = indicators.map((i) => `${i.symbol}:${i.score ?? 'n'}`).join(',');

  // Server-written history, fetched once. Oldest → newest, today's row (if any)
  // excluded so the live values below always own the "current" point.
  const [rows, setRows] = useState<SnapshotRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .from('macro_daily_snapshots')
      .select('snapshot_date, module_scores, indicator_scores')
      .order('snapshot_date', { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const today = todayStr();
        const asc = (data as SnapshotRow[])
          .filter((r) => r.snapshot_date < today)
          .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
        setRows(asc);
      });
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    // No history yet and live scores not settled → nothing meaningful to show.
    if (rows.length === 0 && !ready) return EMPTY_RESULT;

    const liveModule: Record<ModuleSleeveKey, number | null> = {
      regime, trend, volatility, credit, rates_dollar: ratesDollar, gex, risk_appetite: riskAppetite,
    };

    const deltas = Object.fromEntries(SLEEVE_KEYS.map((key) => {
      const history = rows.map((r) => r.module_scores?.[key] ?? null);
      // Fold today's live score in as the current point once the sleeves settle.
      if (ready) history.push(liveModule[key]);
      return [key, buildEntry(history)];
    })) as Record<ModuleSleeveKey, TrendHistoryEntry>;

    const indicatorDeltas: Record<string, TrendHistoryEntry> = {};
    indicators.forEach((ind) => {
      const history = rows.map((r) => r.indicator_scores?.[ind.symbol] ?? null);
      if (ready) history.push(ind.score);
      indicatorDeltas[ind.symbol] = buildEntry(history);
    });

    return { deltas, indicatorDeltas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ready, regime, trend, volatility, credit, ratesDollar, gex, riskAppetite, indicatorsKey]);
}
