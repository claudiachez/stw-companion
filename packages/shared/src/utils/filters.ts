import { positionType } from './positions';

export type SortMode =
  | 'conviction' | 'az' | 'za' | 'recent' | 'oldest'
  | 'weight_desc' | 'weight_asc' | 'pnl_desc' | 'pnl_asc';

// Plain filter criteria (decoupled from any UI store). The web/admin zustand
// store satisfies this structurally.
export interface FilterCriteria {
  search: string;
  basket: string;
  tier:   string;   // '' | '5'..'0'
  status: string;   // '' | 'New' | 'Upsized' | 'Hold' | 'Trimmed' | 'Closed'
  type:   string;   // '' | 'shares' | 'options' | 'mixed'
  hideClosed?: boolean; // default behavior: hide Closed positions unless explicitly filtered for
}

// Minimal structural shape the filter/sort functions read. Any concrete Holding
// type (web's api.Holding, admin's, the shared Holding) is assignable to this.
export interface FilterableHolding {
  ticker: string;
  name: string | null;
  basket: string | null;
  conviction: number;
  last_action: string | null;
  position_detail: string | null;
  rank: number;
  action_date: string | null;
  current_weight: number | null;
}

export function applyFilters<T extends FilterableHolding>(holdings: T[], f: FilterCriteria): T[] {
  return holdings.filter((h) => {
    // Hide closed positions by default, unless the user explicitly filters for Closed.
    if (f.hideClosed && f.status !== 'Closed' && h.last_action === 'Closed') return false;
    if (f.basket && h.basket !== f.basket) return false;
    if (f.tier   && h.conviction !== Number(f.tier)) return false;
    if (f.status && h.last_action !== f.status) return false;
    if (f.type   && positionType(h.position_detail) !== f.type) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!h.ticker.toLowerCase().includes(q) &&
          !(h.name ?? '').toLowerCase().includes(q) &&
          !(h.basket ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function sortFlat<T extends FilterableHolding>(holdings: T[], sort: SortMode): T[] {
  const dateVal = (h: T) => (h.action_date ? new Date(h.action_date).getTime() : 0);
  // `pnl_desc`/`pnl_asc` are not data-only sorts — they need a live-price-derived
  // P&L map, so they're handled by `sortByPnl` at the call site. Here they fall
  // back to conviction ordering.
  const fns: Partial<Record<SortMode, (a: T, b: T) => number>> = {
    conviction:  (a, b) => b.conviction - a.conviction || a.rank - b.rank,
    az:          (a, b) => a.ticker.localeCompare(b.ticker),
    za:          (a, b) => b.ticker.localeCompare(a.ticker),
    recent:      (a, b) => dateVal(b) - dateVal(a),
    oldest:      (a, b) => dateVal(a) - dateVal(b),
    weight_desc: (a, b) => (b.current_weight ?? 0) - (a.current_weight ?? 0),
    weight_asc:  (a, b) => (a.current_weight ?? 0) - (b.current_weight ?? 0),
  };
  return [...holdings].sort(fns[sort] ?? fns.conviction!);
}

// Sort by a precomputed P&L map (ticker → pnlPct). P&L depends on live prices /
// IBKR data, which only the React layer has, so the map is built there and the
// ordering logic lives here. Positions with no P&L (null) always sort last.
export function sortByPnl<T extends FilterableHolding>(
  holdings: T[],
  pnlByTicker: Record<string, number | null | undefined>,
  dir: 'asc' | 'desc',
): T[] {
  const val = (h: T) => pnlByTicker[h.ticker];
  return [...holdings].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;   // nulls last
    if (bv == null) return -1;
    return dir === 'desc' ? bv - av : av - bv;
  });
}
