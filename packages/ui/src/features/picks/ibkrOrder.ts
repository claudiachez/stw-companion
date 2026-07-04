// Types for the admin-only "Execute/Close via IBKR" flow (LegTimeline.tsx). The
// actual proxy call lives in apps/admin (localhost:8765, see ibkr_proxy.py's
// /place_order) — never in this shared package — and is injected via
// AppCapabilities.onExecuteIbkrOrder, exactly like onEditHolding. apps/web never
// sets that capability, so the button never renders there and this package never
// needs to know the proxy's URL.
export interface IbkrOrderSpec {
  symbol: string;
  instrument: 'SHARES' | 'OPTION';
  side: 'BUY' | 'SELL';
  quantity: number;
  order_type: 'MKT' | 'LMT';
  limit_price?: number;
  strike?: number;
  right?: 'C' | 'P';
  expiry?: string; // YYYYMMDD
}

export interface IbkrOrderResult {
  status: string; // 'Filled' | 'Submitted' | 'PendingSubmit' | 'Cancelled' | 'Rejected' | ...
  order_id?: number;
  perm_id?: number;
  avg_fill_price?: number;
  filled_quantity?: number;
  error?: string;
  possibles?: { expiry: string; strike: number; right: string }[];
}
