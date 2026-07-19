// ── Context ───────────────────────────────────────────────────
export { AppCapabilitiesProvider, useCapabilities } from './context/AppCapabilities';
export type { AppCapabilities } from './context/AppCapabilities';
export type { IbkrOrderSpec, IbkrOrderResult } from './features/picks/ibkrOrder';

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
export { useAppConfig } from './hooks/useAppConfig';

// ── Primitives ────────────────────────────────────────────────
export { LoadingSpinner } from './primitives/LoadingSpinner';
export { EmptyState } from './primitives/EmptyState';
export type { EmptyStateProps } from './primitives/EmptyState';

// ── Design system (Phase 3 — plans/stw-design-system.md) ───────
export { StatusPill } from './primitives/StatusPill';
export type { StatusPillVariant, StatusPillProps } from './primitives/StatusPill';
export { Badge } from './primitives/Badge';
export type { BadgeKind, BadgeProps } from './primitives/Badge';
export { KpiCard } from './primitives/KpiCard';
export type { KpiCardProps, KpiDeltaDirection, KpiStatus } from './primitives/KpiCard';
export { SectionHeader } from './primitives/SectionHeader';
export type { SectionHeaderProps } from './primitives/SectionHeader';
export { Button } from './primitives/Button';
export type { ButtonProps, ButtonVariant } from './primitives/Button';
export { DataTable } from './primitives/DataTable';
export type { DataTableColumn, DataTableProps } from './primitives/DataTable';
export { DetailPane, DetailPaneMetricLabel } from './primitives/DetailPane';
export type { DetailPaneProps, DetailPaneMetric } from './primitives/DetailPane';
export { ListDetailSplit } from './primitives/ListDetailSplit';
export type { ListDetailSplitProps } from './primitives/ListDetailSplit';
export { AccordionList } from './primitives/AccordionList';
export type { AccordionListProps } from './primitives/AccordionList';
export { FormRow } from './primitives/FormRow';
export type { FormRowProps } from './primitives/FormRow';
export { AlertStrip } from './primitives/AlertStrip';
export type { AlertSeverity, AlertStripProps } from './primitives/AlertStrip';
export { SubNav } from './primitives/SubNav';
export type { SubNavItem, SubNavProps } from './primitives/SubNav';
export { Modal } from './primitives/Modal';
export type { ModalProps } from './primitives/Modal';
export { Icon } from './primitives/Icon';
export type { IconName, IconProps } from './primitives/Icon';
export { TextInput } from './primitives/TextInput';
export type { TextInputProps } from './primitives/TextInput';
export { DesignSystemGallery } from './primitives/DesignSystemGallery';

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
export { saveIbkrSettings, fetchDiscordLink, linkDiscord } from './features/portfolio/api';
export type { UserPosition, IbkrSettings } from './features/portfolio/api';

// ── Limits engine (Item 2, plans/integrity-guardrails.md) ──────
// Split 2026-07-06 (host decision): RiskConfigForm = Settings (account setup
// only); ViolationsSummary = My Portfolio (book-level breach display, lives
// with the position data it's about). LimitsPanel remains as apps/admin's
// composite of both, since admin has no separate "My Portfolio" page.
export { LimitsPanel } from './features/limits/LimitsPanel';
export { RiskConfigForm } from './features/limits/RiskConfigForm';
export { ViolationsSummary } from './features/limits/ViolationsSummary';
export { useRiskConfig, useSectorMap, useViolationAcks, useAcknowledgeViolation, useEnsureRiskConfig, useSaveRiskConfig } from './features/limits/useRiskConfig';
export type { RiskConfigRow, ViolationAck, AckStatus, ViolationType } from './features/limits/api';

// ── Advisory regime light (Item 3, plans/integrity-guardrails.md) ─────
export { RegimeLight } from './features/regime/RegimeLight';
export { useLatestRegime } from './features/regime/useLatestRegime';
export type { RegimeDailyRow } from './features/regime/api';

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
