import { useGraddox } from './useGraddox';
import { LevelCard } from './components/LevelCard';
import { SignalsTable } from './components/SignalsTable';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { EmptyState } from '../../shared/components/EmptyState';
import { AccessGate } from '../../shared/components/AccessGate';
import { useTierAccess } from '../../shared/hooks/useTierAccess';
import { useProfile } from '../../shared/hooks/useProfile';

export function SignalsPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const canAccess = useTierAccess('signals');
  const { data, isLoading, error } = useGraddox();

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

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (error) return <EmptyState message="Failed to load signals data." />;

  const { signals, levels } = data!;

  const tickers = [...new Set(levels.map((l) => l.ticker))].sort();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-8">
      {tickers.length > 0 && (
        <section>
          <h2 className="text-t3 text-xs uppercase tracking-wider mb-4">Key Levels</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tickers.map((ticker) => (
              <LevelCard
                key={ticker}
                ticker={ticker}
                levels={levels.filter((l) => l.ticker === ticker)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-t3 text-xs uppercase tracking-wider mb-4">Signal Log</h2>
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <SignalsTable signals={signals} />
        </div>
      </section>
    </div>
  );
}
