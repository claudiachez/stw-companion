import { useGraddox } from './useGraddox';
import { LevelCard } from './components/LevelCard';
import { SignalsTable } from './components/SignalsTable';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { EmptyState } from '../../shared/components/EmptyState';
import { useTierAccess } from '../../shared/hooks/useTierAccess';

export function SignalsPage() {
  const canAccess = useTierAccess('signals');
  const { data, isLoading, error } = useGraddox();

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 mt-24 px-4 text-center">
        <div className="w-12 h-12 bg-s2 rounded-full flex items-center justify-center text-t2 text-xl">🔒</div>
        <h2 className="text-text font-semibold">Signals require a Basic or Premium subscription</h2>
        <p className="text-t2 text-sm max-w-xs">Upgrade your plan or wait for your account to be approved to access GEX signals.</p>
      </div>
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
