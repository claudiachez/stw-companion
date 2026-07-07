import { createContext, useContext, type ReactNode } from 'react';
import type { Holding } from '../features/picks/api';
import type { IbkrOrderSpec, IbkrOrderResult } from '../features/picks/ibkrOrder';

/**
 * The single seam between the subscriber (web) and admin shells. Shared
 * components read capabilities from here instead of forking on `isAdmin`.
 * Apps inject their capabilities + config once at the root.
 */
export interface AppCapabilities {
  /** Admin shell (no paywall, can edit, sees IBKR writer). */
  isAdmin: boolean;
  /** Whether edit affordances render (admin only). */
  canEdit: boolean;
  /** Whether the IBKR sync badge renders (admin only). */
  showIbkrBadge: boolean;
  /** Whether transaction history + conviction timelines are visible (premium or admin). */
  canViewHistory?: boolean;
  /** Whether the Limits engine (risk-limits violations + thresholds) is visible (premium or admin). */
  canUseLimits?: boolean;
  /** Invoked when an editable holding is chosen (admin Edit form). */
  onEditHolding?: (holding: Holding) => void;
  /** Finnhub API key for live prices — injected from each app's env. */
  finnhubKey?: string;
  /** TwelveData API key for GEX-signal candlestick charts — injected per-app. */
  twelveDataKey?: string;
  /**
   * Places a real IBKR order via the admin's local proxy (ibkr_proxy.py). Admin-only:
   * wired by apps/admin's root (see apps/admin/src/features/ibkr/placeOrder.ts);
   * apps/web never sets this, so the "Execute/Close via IBKR" affordances in
   * LegTimeline never render there, and this package never needs the proxy's URL.
   * Further gated in the UI by the `ibkr_live_trading_enabled` app_config flag.
   */
  onExecuteIbkrOrder?: (spec: IbkrOrderSpec) => Promise<IbkrOrderResult>;
}

const DEFAULTS: AppCapabilities = {
  isAdmin: false,
  canEdit: false,
  showIbkrBadge: false,
};

const Ctx = createContext<AppCapabilities>(DEFAULTS);

export function AppCapabilitiesProvider({
  value,
  children,
}: {
  value: AppCapabilities;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCapabilities(): AppCapabilities {
  return useContext(Ctx);
}
