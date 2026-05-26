import { useState } from 'react';
import { useHoldings } from './useHoldings';
import { useFiltersStore, applyFilters } from './useFilters';
import { FilterBar } from './components/FilterBar';
import { HoldingRow } from './components/HoldingRow';
import { HoldingDetail } from './components/HoldingDetail';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { EmptyState } from '../../shared/components/EmptyState';

export function PicksPage() {
  const { data: holdings = [], isLoading, error } = useHoldings();
  const filters = useFiltersStore();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const filtered = applyFilters(holdings, filters);
  const selected = filtered.find((h) => h.ticker === selectedTicker) ?? null;

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (error) return <EmptyState message="Failed to load holdings." />;

  return (
    <>
      <FilterBar holdings={holdings} />

      {/* Desktop: split panel. Mobile: list, then detail overlays */}
      <div className="flex h-[calc(100vh-7rem)]">
        {/* List panel — hidden on mobile when detail is open */}
        <div
          className={`flex flex-col overflow-y-auto border-r border-border ${
            selected ? 'hidden md:flex md:w-80 lg:w-96' : 'w-full md:w-80 lg:w-96'
          }`}
        >
          {filtered.length === 0 ? (
            <EmptyState message="No positions match your filters." />
          ) : (
            filtered.map((h) => (
              <HoldingRow
                key={h.ticker}
                holding={h}
                isSelected={h.ticker === selectedTicker}
                onClick={() => setSelectedTicker(h.ticker === selectedTicker ? null : h.ticker)}
              />
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected ? (
          <div className="flex-1 overflow-hidden">
            <HoldingDetail
              holding={selected}
              onClose={() => setSelectedTicker(null)}
            />
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-t3 text-sm">
            Select a position to view details
          </div>
        )}
      </div>
    </>
  );
}
