import type { HoldingTransaction, Direction } from '@stw/shared';
import { inferDirection } from '@stw/shared';

// A trade = one position lifecycle (one leg of a ticker): opened by the first row,
// optionally closed by a 'Closed' row. Derived from holding_transactions; the per-action
// rows remain the source of truth.
export interface Trade {
  key: string;          // `${ticker}#${leg}`
  ticker: string;
  leg: number;
  openTx: HoldingTransaction | null;
  closeTx: HoldingTransaction | null;
  openDate: string | null;
  closeDate: string | null;
  openPrice: number | null;
  closePrice: number | null;
  direction: Direction;
  positionDetail: string | null;
  weight: number | null;
  realizedPnl: number | null;   // exit P&L from the Closed row
  isOpen: boolean;
}

function byDateAsc(a: HoldingTransaction, b: HoldingTransaction): number {
  if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
  return a.id - b.id;
}

export function deriveTrades(transactions: HoldingTransaction[]): Trade[] {
  const groups = new Map<string, HoldingTransaction[]>();
  for (const tx of transactions) {
    if (tx.ticker === 'CASH') continue;
    const key = `${tx.ticker}#${tx.leg}`;
    const arr = groups.get(key);
    if (arr) arr.push(tx); else groups.set(key, [tx]);
  }

  const trades: Trade[] = [];
  for (const [key, rows] of groups) {
    const sorted = [...rows].sort(byDateAsc);
    const openTx = sorted.find((t) => t.action === 'New') ?? sorted[0] ?? null;
    const closeTx = [...sorted].reverse().find((t) => t.action === 'Closed') ?? null;
    const positionDetail = openTx?.position_detail ?? closeTx?.position_detail ?? null;
    const direction = openTx?.direction ?? closeTx?.direction ?? inferDirection(positionDetail);
    trades.push({
      key,
      ticker: sorted[0].ticker,
      leg: sorted[0].leg,
      openTx,
      closeTx,
      openDate: openTx?.event_date ?? null,
      closeDate: closeTx?.event_date ?? null,
      openPrice: openTx?.price ?? null,
      closePrice: closeTx?.price ?? null,
      direction,
      positionDetail,
      weight: openTx?.weight ?? null,
      realizedPnl: closeTx?.pnl_pct ?? null,
      isOpen: !closeTx,
    });
  }

  // Open trades first, then most-recent activity first.
  return trades.sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    const ad = a.closeDate ?? a.openDate ?? '';
    const bd = b.closeDate ?? b.openDate ?? '';
    return ad < bd ? 1 : ad > bd ? -1 : 0;
  });
}

// Whole-day difference between two YYYY-MM-DD dates (null if either is missing).
export function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from + 'T00:00:00').getTime();
  const b = new Date(to + 'T00:00:00').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
