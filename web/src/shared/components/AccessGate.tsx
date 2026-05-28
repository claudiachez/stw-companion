import type { Profile } from '../hooks/useProfile';

interface Props {
  profile: Profile | null | undefined;
  module: string;          // e.g. 'picks' or 'signals'
  moduleLabel?: string;    // e.g. 'Stock Picks'
  tierRequired?: string;   // e.g. 'Basic' — shown in upgrade prompt
}

/**
 * Renders the appropriate locked screen based on profile status and tier.
 * Returns null when access should be allowed (caller renders normal content).
 *
 * Usage:
 *   const gate = <AccessGate profile={profile} module="picks" moduleLabel="Stock Picks" />;
 *   if (gate) return gate;
 *   return <NormalContent />;
 */
export function AccessGate({ profile, module: _module, moduleLabel, tierRequired }: Props) {
  // Still loading — show nothing (caller should show spinner)
  if (profile === undefined) return null;

  // No profile row yet — treat as pending (trigger/upsert will create it)
  if (!profile) return <PendingScreen />;

  if (profile.status === 'pending') return <PendingScreen />;
  if (profile.status === 'rejected') return <RejectedScreen />;

  // Approved but wrong tier — show upgrade prompt
  // (useTierAccess returning false after approved means wrong tier)
  return (
    <UpgradeScreen
      moduleLabel={moduleLabel ?? 'this feature'}
      tierRequired={tierRequired ?? 'Basic'}
    />
  );
}

// ── Screens ──────────────────────────────────────────────────

function PendingScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 mt-24 px-4 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
        style={{ background: 'var(--s2)', border: '1px solid var(--bsub)' }}
      >
        ⏳
      </div>
      <h2 className="text-text font-semibold text-lg">Pending Approval</h2>
      <p className="text-t2 text-sm max-w-xs leading-relaxed">
        Your account is under review. You'll have full access once the STW team approves it —
        usually within 24 hours.
      </p>
      <p className="text-t3 text-xs mt-2">
        Already approved? Try refreshing the page.
      </p>
    </div>
  );
}

function RejectedScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 mt-24 px-4 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
        style={{ background: 'var(--s2)', border: '1px solid var(--bsub)' }}
      >
        🔒
      </div>
      <h2 className="text-text font-semibold text-lg">Access Denied</h2>
      <p className="text-t2 text-sm max-w-xs leading-relaxed">
        Your account was not approved. Contact{' '}
        <a href="mailto:cc@claudiachez.com" className="text-acc underline">
          cc@claudiachez.com
        </a>{' '}
        if you think this is a mistake.
      </p>
    </div>
  );
}

function UpgradeScreen({ moduleLabel, tierRequired }: { moduleLabel: string; tierRequired: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 mt-24 px-4 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
        style={{ background: 'var(--s2)', border: '1px solid var(--bsub)' }}
      >
        🔒
      </div>
      <h2 className="text-text font-semibold text-lg">{tierRequired} plan required</h2>
      <p className="text-t2 text-sm max-w-xs leading-relaxed">
        {moduleLabel} requires a <strong>{tierRequired}</strong> subscription or higher.
        Contact your STW administrator to upgrade your plan.
      </p>
    </div>
  );
}
