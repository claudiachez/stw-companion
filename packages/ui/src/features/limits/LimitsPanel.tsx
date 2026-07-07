import { useAuthStore } from '../../store/auth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { useRiskConfig, useEnsureRiskConfig } from './useRiskConfig';
import { RiskConfigForm } from './RiskConfigForm';
import { ViolationsSummary } from './ViolationsSummary';

// apps/admin's composite of the split Limits feature (host decision,
// 2026-07-06) — admin has no separate "My Portfolio" page, so it keeps both
// halves together on one Limits tab: ViolationsSummary (book-level breaches,
// with its own Sync button since admin has no other sync surface) +
// RiskConfigForm (thresholds). apps/web renders these two pieces on separate
// pages instead — see SettingsPage.tsx and PortfolioPage.tsx.

export function LimitsPanel() {
  const userId = useAuthStore((s) => s.user?.id);
  const isMobile = useIsMobile();
  const { data: config, isLoading: configLoading } = useRiskConfig(userId);
  useEnsureRiskConfig(userId, config, configLoading);

  if (configLoading || !config) return <LoadingSpinner className="mt-16" />;

  return (
    <div className={`${isMobile ? '' : 'max-w-2xl mx-auto'} flex flex-col gap-4`}>
      <ViolationsSummary showSyncButton />
      <RiskConfigForm userId={userId!} config={config} />
    </div>
  );
}
