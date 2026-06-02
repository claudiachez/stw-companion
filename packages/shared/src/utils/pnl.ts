import type { PositionType } from './positions';

export interface PnlInput {
  /** shares | options | mixed | null (from positionType()) */
  positionType: PositionType | null;
  /** Resolved underlying price (live quote ?? last_price), or null. */
  price: number | null;
  /** Equity cost basis (parseCostBasis(position_detail)), or null. */
  costBasis: number | null;
  /** IBKR-computed average options P&L % (holdings.last_pnl_pct), or null. */
  optionsPnlPct: number | null;
}

export interface PnlResult {
  /** Calculated equity P&L % from price vs cost basis. */
  equityPnl: number | null;
  /** Options P&L % (passthrough of IBKR value). */
  optionsPnl: number | null;
  /** Resolved headline P&L % shown on the detail card. */
  pnlPct: number | null;
}

// Single source of the holding-detail P&L resolution:
//   shares  → equity P&L (price vs cost basis)
//   options → IBKR options P&L
//   mixed   → simple average of both when available, else whichever exists
// Extracted verbatim from web's HoldingDetail so both apps compute identically.
export function resolvePnl({ positionType: pType, price, costBasis: cost, optionsPnlPct }: PnlInput): PnlResult {
  const equityPnl = cost && price ? ((price - cost) / cost) * 100 : null;
  const optionsPnl = optionsPnlPct ?? null;
  const pnlPct =
    pType === 'shares'  ? equityPnl :
    pType === 'options' ? optionsPnl :
    pType === 'mixed'   ? (equityPnl != null && optionsPnl != null
                            ? (equityPnl + optionsPnl) / 2
                            : equityPnl ?? optionsPnl)
    : equityPnl;
  return { equityPnl, optionsPnl, pnlPct };
}
