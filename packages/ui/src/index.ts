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
export type { Holding, IbkrLeg } from './features/picks/api';
export type { SortMode } from './features/picks/useFilters';
export { HoldingRow } from './features/picks/components/HoldingRow';
export { HoldingDetail } from './features/picks/components/HoldingDetail';
export { HoldingEditForm } from './features/picks/components/HoldingEditForm';
export { FilterBar } from './features/picks/components/FilterBar';
export { PortfolioDashboard } from './features/picks/components/PortfolioDashboard';
export { useRecentChanges } from './features/picks/useRecentChanges';
export type { RecentChange } from './features/picks/useRecentChanges';
export { ConvictionBadge } from './features/picks/components/ConvictionBadge';

// ── Signals ───────────────────────────────────────────────────
export { SignalsView } from './features/signals/SignalsView';
export { useGraddox } from './features/signals/useGraddox';
export { fetchGraddox } from './features/signals/api';
export type { Signal, GraddoxLevel, GraddoxData } from './features/signals/api';
export { LevelCard } from './features/signals/components/LevelCard';
export { SignalsTable } from './features/signals/components/SignalsTable';
export { BiasChip } from './features/signals/components/BiasChip';
