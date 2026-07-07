import { PortfolioPage, AppCapabilitiesProvider, useCapabilities } from '@stw/ui';
import { useTierAccess } from '../../shared/hooks/useTierAccess';

/**
 * My Portfolio has no paywall of its own (every subscriber can connect IBKR and
 * see their own book) — only the Limits engine section within it is Premium-gated.
 * Mirrors PicksRoute's pattern for canViewHistory.
 */
export function PortfolioRoute() {
  const canUseLimits = useTierAccess('limits');
  return <PortfolioWithLimits canUseLimits={canUseLimits} />;
}

function PortfolioWithLimits({ canUseLimits }: { canUseLimits: boolean }) {
  const base = useCapabilities();
  return (
    <AppCapabilitiesProvider value={{ ...base, canUseLimits }}>
      <PortfolioPage />
    </AppCapabilitiesProvider>
  );
}
