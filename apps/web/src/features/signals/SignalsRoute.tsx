import { SignalsView, LoadingSpinner } from '@stw/ui';
import { AccessGate } from '../../shared/components/AccessGate';
import { useProfile } from '../../shared/hooks/useProfile';
import { useTierAccess } from '../../shared/hooks/useTierAccess';

/**
 * Subscriber paywall around the shared Signals content. The admin shell mounts
 * <SignalsView/> directly with no gate.
 */
export function SignalsRoute() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const canAccess = useTierAccess('signals');

  if (profileLoading) return <LoadingSpinner className="mt-16" />;
  if (!canAccess) {
    return (
      <AccessGate
        profile={profile}
        module="signals"
        moduleLabel="GEX Signals"
        tierRequired="Premium"
      />
    );
  }

  return <SignalsView />;
}
