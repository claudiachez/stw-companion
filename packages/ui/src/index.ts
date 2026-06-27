// ── Context ───────────────────────────────────────────────────
export { AppCapabilitiesProvider, useCapabilities } from './context/AppCapabilities';
export type { AppCapabilities } from './context/AppCapabilities';

// ── Lib (injected per-app) ────────────────────────────────────
export { setSupabaseClient, getSupabase } from './lib/supabase';
export { createQueryClient } from './lib/query-client';

// ── Shell (auth + chrome) ─────────────────────────────────────
export { AuthGuard } from './auth/AuthGuard';
export { LoginPage } from './auth/LoginPage';
export { useSession } from './auth/useSession';
export { Layout } from './components/Layout';
export type { NavItem } from './components/Layout';
export { ProfilePage } from './components/ProfilePage';
export { TickerLink } from './primitives/TickerLink';

// ── Store ─────────────────────────────────────────────────────
export { usePriceCacheStore } from './store/priceCache';
export type { Quote, PriceFetchStatus } from './store/priceCache';
export { useAuthStore } from './store/auth';
export { useThemeStore } from './store/theme';

// ── Hooks ─────────────────────────────────────────────────────
export { useQuote, useLivePrice } from './hooks/useLivePrice';
export { useIsMobile } from './hooks/useIsMobile';

// ── Primitives ────────────────────────────────────────────────
export { LoadingSpinner } from './primitives/LoadingSpinner';
export { EmptyState } from './primitives/EmptyState';

// ── Picks ─────────────────────────────────────────────────────
export { PicksView } from './features/picks/PicksView';
export { useHoldings } from './features/picks/useHoldings';
export { useFiltersStore, applyFilters, sortFlat } from './features/picks/useFilters';
export { fetchHoldings } from './features/picks/api';
export type { Holding } from './features/picks/api';
export type { SortMode } from './features/picks/useFilters';
export { HoldingRow } from './features/picks/components/HoldingRow';
export { HoldingDetail } from './features/picks/components/HoldingDetail';
export { FilterBar } from './features/picks/components/FilterBar';
export { PortfolioDashboard } from './features/picks/components/PortfolioDashboard';
export { useRecentChanges } from './features/picks/useRecentChanges';
export type { RecentChange } from './features/picks/useRecentChanges';
export { ConvictionBadge } from './features/picks/components/ConvictionBadge';

// ── Portfolio ─────────────────────────────────────────────────
export { PortfolioPage } from './features/portfolio/PortfolioPage';
export { useUserPositions, useIbkrSettings } from './features/portfolio/useUserPositions';
export { useSyncPortfolio } from './features/portfolio/useSyncPortfolio';
export { saveIbkrSettings } from './features/portfolio/api';
export type { UserPosition, IbkrSettings } from './features/portfolio/api';

// ── Macro ─────────────────────────────────────────────────────
export { MacroView } from './features/macro/MacroView';

// ── Signals ───────────────────────────────────────────────────
export { SignalsView } from './features/signals/SignalsView';
export { useGraddox } from './features/signals/useGraddox';
export { fetchGraddox } from './features/signals/api';
export type { Signal, LevelSet, LogEntry, GraddoxData } from './features/signals/api';
export { LevelCard } from './features/signals/components/LevelCard';
export { SignalsTable } from './features/signals/components/SignalsTable';
export { BiasChip } from './features/signals/components/BiasChip';
export { GexCharts } from './features/signals/components/GexCharts';
export { GexChart } from './features/signals/components/GexChart';
export type { Timeframe } from './features/signals/components/GexChart';
export { DayLog } from './features/signals/components/DayLog';
