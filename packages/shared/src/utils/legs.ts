import type { Direction, PositionType } from './positions';

// The structured per-leg position model (migrations 029/030) that replaces the
// `holdings.position_detail` text blob. A leg is SIZE-LESS: there are no share/contract
// counts anywhere — the only sizing signal is the host's published `weight` (% of portfolio).
// P&L is therefore a PERCENTAGE, never a dollar figure (dollars are derived later by the
// deferred $100k notional layer as weight × NAV × pnl%).

export type LegInstrument = 'SHARES' | 'OPTION';
export type LegStatus = 'OPEN' | 'CLOSED' | 'EXPIRED_WORTHLESS' | 'EXERCISED';
export type OptionRight = 'CALL' | 'PUT';
export type MarkPriceSource = 'FINNHUB' | 'IBKR';
export type LegCloseReason =
  | 'PROFIT_TARGET' | 'STOP_HIT' | 'THESIS_BROKEN' | 'TRAIL_STOP'
  | 'EXPIRED_WORTHLESS' | 'EXERCISED';

export interface Leg {
  id: string;
  ticker: string;
  trader_id: string;
  parent_leg_id: string | null;
  instrument_type: LegInstrument;
  option_strike: number | null;
  option_expiry: string | null;   // 'YYYY-MM-DD'
  option_right: OptionRight | null;
  direction: Direction;
  status: LegStatus;
  entry_price: number | null;
  weight: number | null;          // CURRENT per-leg weight (% of portfolio) — derived from the
                                  // position weight via the 90/10 rule unless weight_overridden
  initial_weight: number | null;  // ENTRY per-leg weight (migration 037)
  weight_overridden: boolean;     // manual per-leg weight — pinned; the split + routine skip it (039)
  mark_price: number | null;
  mark_price_source: MarkPriceSource | null;
  mark_price_at: string | null;
  exit_price: number | null;
  realized_pnl_pct: number | null;
  opened_at: string | null;
  closed_at: string | null;
  close_reason: LegCloseReason | null;
}

export interface LegTransaction {
  id: string;
  leg_id: string;
  trader_id: string;
  action_type: 'BUY' | 'SELL' | 'EXERCISED' | 'EXPIRED';
  price: number | null;
  weight: number | null;
  close_reason: string | null;
  executed_at: string;
  notes: string | null;
}

export function legIsOpen(leg: Leg): boolean {
  return leg.status === 'OPEN';
}

// The current mark for a leg. SHARES legs ride the live Finnhub underlying quote (the IBKR
// proxy doesn't price equities); OPTION legs use the per-contract mark written by the proxy.
export function legMark(leg: Leg, livePrice: number | null | undefined): number | null {
  if (leg.instrument_type === 'SHARES') return livePrice ?? leg.mark_price ?? null;
  return leg.mark_price ?? null;
}

// Unrealized P&L % for an open leg: (mark − entry) / entry × 100, flipped for shorts.
export function legUnrealizedPnlPct(leg: Leg, livePrice: number | null | undefined): number | null {
  const entry = leg.entry_price;
  const mark = legMark(leg, livePrice);
  if (entry == null || entry === 0 || mark == null) return null;
  const sign = leg.direction === 'short' ? -1 : 1;
  return ((mark - entry) / entry) * 100 * sign;
}

// Realized P&L % for a closed leg: (exit − entry) / entry × 100, flipped for shorts. Mirrors the
// 030 leg-state trigger EXACTLY so the admin leg editor (which writes legs directly) and the
// DB-derived value agree. EXPIRED_WORTHLESS → pass exit 0 → −100% long / +100% short.
export function computeRealizedPct(
  entry: number | null | undefined,
  exit: number | null | undefined,
  direction: Direction = 'long',
): number | null {
  if (entry == null || entry === 0 || exit == null) return null;
  const sign = direction === 'short' ? -1 : 1;
  return ((exit - entry) / entry) * 100 * sign;
}

// Derive each leg's weight from the position (holding) weight via the host's split rule:
//   mixed       → 90% across share-lots, 10% across option legs
//   options-only→ even split across the option legs
//   shares-only → 100% to the shares leg
// A leg with `weight_overridden` is PINNED (keeps its own weight); the remainder of its bucket is
// split across the non-overridden legs in that bucket. Returns { [legId]: weight }.
type WeightLeg = Pick<Leg, 'id' | 'instrument_type' | 'weight' | 'weight_overridden'>;
export function deriveLegWeights(positionWeight: number | null, legs: WeightLeg[]): Record<string, number> {
  const out: Record<string, number> = {};
  const W = positionWeight ?? 0;
  const shares = legs.filter((l) => l.instrument_type === 'SHARES');
  const options = legs.filter((l) => l.instrument_type === 'OPTION');
  const hasS = shares.length > 0;
  const hasO = options.length > 0;

  const splitBucket = (bucket: WeightLeg[], bucketWeight: number) => {
    const pinned = bucket.filter((l) => l.weight_overridden);
    const free = bucket.filter((l) => !l.weight_overridden);
    const pinnedSum = pinned.reduce((s, l) => s + (l.weight ?? 0), 0);
    const each = free.length > 0 ? Math.max(0, bucketWeight - pinnedSum) / free.length : 0;
    for (const l of pinned) out[l.id] = l.weight ?? 0;
    for (const l of free) out[l.id] = Math.round(each * 1000) / 1000;
  };

  if (hasS && hasO) {
    splitBucket(shares, 0.9 * W);
    splitBucket(options, 0.1 * W);
  } else if (hasO) {
    splitBucket(options, W);
  } else {
    splitBucket(shares, W);
  }
  return out;
}

// The P&L % to display for a leg in its current state:
//   OPEN                          → unrealized (needs a live/mark price)
//   CLOSED / EXPIRED_WORTHLESS    → booked realized_pnl_pct
//   EXERCISED                     → null (value transferred to the spawned shares leg)
export function legPnlPct(leg: Leg, livePrice: number | null | undefined): number | null {
  if (leg.status === 'EXERCISED') return null;
  if (leg.status === 'CLOSED' || leg.status === 'EXPIRED_WORTHLESS') return leg.realized_pnl_pct;
  return legUnrealizedPnlPct(leg, livePrice);
}

// Headline holding P&L %: weight-weighted average of each leg's P&L %, over legs that have
// both a resolvable pnl and a weight. A 5.4%-weight share leg therefore dominates a
// 0.2%-weight option leg. Returns null when no leg resolves.
export function holdingPnlPct(legs: Leg[], livePrice: number | null | undefined): number | null {
  let wSum = 0;
  let wPnl = 0;
  for (const leg of legs) {
    const pnl = legPnlPct(leg, livePrice);
    const w = leg.weight;
    if (pnl == null || w == null || w === 0) continue;
    wSum += w;
    wPnl += w * pnl;
  }
  return wSum > 0 ? wPnl / wSum : null;
}

// Classify a holding from its legs (replaces positionType(position_detail)). Mixed = both a
// shares lot and an option leg; options/shares when only one kind is present.
export function holdingType(legs: Leg[]): PositionType | null {
  let hasShares = false;
  let hasOptions = false;
  for (const leg of legs) {
    if (leg.instrument_type === 'SHARES') hasShares = true;
    else if (leg.instrument_type === 'OPTION') hasOptions = true;
  }
  if (hasShares && hasOptions) return 'mixed';
  if (hasOptions) return 'options';
  if (hasShares) return 'shares';
  return null;
}

// Why an open OPTION leg has no mark (replaces legPriceReason). The legs model has no per-leg
// error field — an unpriced option leg simply hasn't been through an IBKR sync yet. Returns
// null when the leg is priced or doesn't need a mark.
export function legMarkReason(leg: Leg): { title: string; hint?: string } | null {
  if (leg.instrument_type !== 'OPTION') return null;
  if (leg.mark_price != null) return null;
  return { title: 'Not priced yet', hint: 'Run the IBKR sync' };
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' → "Sep '26" (day omitted) or "Sep 18 '26" (with day). Legs always carry a full
// date (the backfill resolves month-only quotes to the 3rd Friday); `withDay` adds the day.
export function fmtOptionExpiry(expiry: string | null, withDay = false): string {
  if (!expiry) return '';
  const [y, m, d] = expiry.split('-');
  const mon = MONTHS[parseInt(m ?? '', 10)] ?? '';
  const yy = (y ?? '').slice(2, 4);
  if (!mon) return expiry;
  return withDay && d ? `${mon} ${parseInt(d, 10)} '${yy}` : `${mon} '${yy}`;
}

// Human label for a leg enum constant: 'EXPIRED_WORTHLESS' → 'Expired Worthless',
// 'PROFIT_TARGET' → 'Profit Target', 'OPEN' → 'Open'. Single source of truth for how leg
// status / close-reason values read in the UI (the dropdowns and the leg rows agree).
export function humanizeLegEnum(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Display label for a leg: "Common" for shares, "$30C Sep '26" for an option.
export function fmtLegInstrument(leg: Leg, withDay = false): string {
  if (leg.instrument_type === 'SHARES') return 'Common';
  const right = leg.option_right === 'PUT' ? 'P' : 'C';
  return `$${leg.option_strike}${right} ${fmtOptionExpiry(leg.option_expiry, withDay)}`.trim();
}

// Compact per-leg breakdown line for the "Entry · Current Weight" panel, e.g.
//   single leg:  "Shares @ $4.71"
//   multi-leg:   "5.8% Shares @ $53.16 · 0.3% $50C Nov '26 · 0.3% $60C Jun '26"
// Shares show their entry price + read "Shares" (not "Common"); options show the contract. Per-leg
// weight (1 decimal) is prefixed only when there are multiple legs — for a single leg it's
// redundant with the holding's current weight shown just above.
export function fmtLegWeightLine(legs: Leg[]): string {
  const multi = legs.length > 1;
  return legs
    .map((l) => {
      const w = multi && l.weight != null ? `${l.weight.toFixed(1)}% ` : '';
      const label = l.instrument_type === 'SHARES' ? 'Shares' : fmtLegInstrument(l);
      const entry = l.instrument_type === 'SHARES' && l.entry_price != null ? ` @ $${l.entry_price}` : '';
      return `${w}${label}${entry}`;
    })
    .join(' · ');
}
