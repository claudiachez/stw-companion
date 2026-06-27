import { useEffect, useMemo, useState } from 'react';
import { classifyTrendDirection } from '@stw/shared';
import type { TrendDirection } from '@stw/shared';

// ── P2: 5D Trend Engine ──────────────────────────────────────────────
// Writes one localStorage snapshot per day of the module sleeve scores +
// per-indicator trend sub-scores, then reads the history back to compute
// 5D/20D deltas + a direction classification. No backend — this is a local,
// best-effort history (resets per browser/device); a Supabase
// `macro_daily_snapshots` table is the spec'd v2 option, not built here.
//
// "N trading days ago" is approximated as "N snapshot-entries ago" (i.e. the
// Nth most recent day the app was open) rather than N calendar days — close
// enough for a tool used on market days, and avoids needing a holiday
// calendar. Deltas are legitimately null until enough entries accrue.

const MODULE_PREFIX = 'macro-module-history-';
const INDICATOR_PREFIX = 'macro-indicator-history-';
const MAX_HISTORY_DAYS = 30; // covers 20-trading-day lookback + buffer

export type ModuleSleeveKey =
  | 'regime' | 'trend' | 'volatility' | 'credit' | 'rates_dollar' | 'gex' | 'risk_appetite';

interface ModuleSnapshot {
  date: string;
  scores: Partial<Record<ModuleSleeveKey, number | null>>;
}

interface IndicatorSnapshot {
  date: string;
  score: number | null;
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
  return new Date().toISOString().slice(0, 10);
}

/** Dates are always the last 10 chars of the key (YYYY-MM-DD), even for the
 *  indicator keys which embed a symbol before the date. */
function dateFromKey(key: string): string {
  return key.slice(-10);
}

function readSnapshots<T extends { date: string }>(prefix: string): T[] {
  const out: T[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      out.push(JSON.parse(raw) as T);
    } catch { /* ignore corrupt entry */ }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function pruneOld(prefix: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_HISTORY_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    if (dateFromKey(k) < cutoffStr) toDelete.push(k);
  }
  toDelete.forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
}

function entryAt<T extends { date: string }>(history: T[], lookback: number): T | null {
  const idx = history.length - 1 - lookback;
  return idx >= 0 ? history[idx] : null;
}

function buildEntry(
  history: { date: string; value: number | null }[],
): TrendHistoryEntry {
  if (history.length === 0) return NULL_ENTRY;
  const current = history[history.length - 1].value;
  const threeAgo = entryAt(history, 3)?.value ?? null;
  const fiveAgo = entryAt(history, 5)?.value ?? null;
  const tenAgo = entryAt(history, 10)?.value ?? null;
  const twentyAgo = entryAt(history, 20)?.value ?? null;

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
  /** Don't write/read until the day's scores have actually settled. */
  ready: boolean;
}

export interface MacroTrendHistoryResult {
  deltas: Record<ModuleSleeveKey, TrendHistoryEntry>;
  indicatorDeltas: Record<string, TrendHistoryEntry>;
}

export function useMacroTrendHistory(input: MacroTrendHistoryInput): MacroTrendHistoryResult {
  const {
    ready, regime, trend, volatility, credit, ratesDollar, gex, riskAppetite, indicators,
  } = input;
  const indicatorsKey = indicators.map((i) => `${i.symbol}:${i.score ?? 'n'}`).join(',');

  // Bump after a write so the read below picks up today's entry without
  // waiting for an unrelated re-render.
  const [writeTick, setWriteTick] = useState(0);

  useEffect(() => {
    if (!ready) return;
    const date = todayStr();
    const snapshot: ModuleSnapshot = {
      date,
      scores: { regime, trend, volatility, credit, rates_dollar: ratesDollar, gex, risk_appetite: riskAppetite },
    };
    try { localStorage.setItem(MODULE_PREFIX + date, JSON.stringify(snapshot)); } catch { /* ignore */ }

    indicators.forEach((ind) => {
      const entry: IndicatorSnapshot = { date, score: ind.score };
      try { localStorage.setItem(`${INDICATOR_PREFIX}${ind.symbol}-${date}`, JSON.stringify(entry)); } catch { /* ignore */ }
    });

    pruneOld(MODULE_PREFIX);
    pruneOld(INDICATOR_PREFIX);
    setWriteTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, regime, trend, volatility, credit, ratesDollar, gex, riskAppetite, indicatorsKey]);

  return useMemo(() => {
    const moduleHistory = readSnapshots<ModuleSnapshot>(MODULE_PREFIX);
    const sleeveKeys: ModuleSleeveKey[] = ['regime', 'trend', 'volatility', 'credit', 'rates_dollar', 'gex', 'risk_appetite'];
    const deltas = Object.fromEntries(sleeveKeys.map((key) => [
      key,
      buildEntry(moduleHistory.map((s) => ({ date: s.date, value: s.scores[key] ?? null }))),
    ])) as Record<ModuleSleeveKey, TrendHistoryEntry>;

    const indicatorDeltas: Record<string, TrendHistoryEntry> = {};
    indicators.forEach((ind) => {
      const symHistory = readSnapshots<IndicatorSnapshot>(`${INDICATOR_PREFIX}${ind.symbol}-`);
      indicatorDeltas[ind.symbol] = buildEntry(symHistory.map((s) => ({ date: s.date, value: s.score })));
    });

    return { deltas, indicatorDeltas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeTick, indicatorsKey]);
}
