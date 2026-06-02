import { PicksView, LoadingSpinner } from '@stw/ui';
import { AccessGate } from '../../shared/components/AccessGate';
import { useProfile } from '../../shared/hooks/useProfile';
import { useTierAccess } from '../../shared/hooks/useTierAccess';

/**
 * Subscriber paywall around the shared Picks content. The admin shell mounts
 * <PicksView/> directly with no gate.
 */
export function PicksRoute() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const canAccess = useTierAccess('picks');

  if (profileLoading) return <LoadingSpinner className="mt-16" />;
  if (!canAccess) {
    return (
      <AccessGate
        profile={profile}
        module="picks"
        moduleLabel="Stock Picks"
        tierRequired="Basic"
      />
    );
  }

  return <PicksView />;
}
