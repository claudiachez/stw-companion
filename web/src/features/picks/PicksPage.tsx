import { useEffect, useState } from 'react';
import { useHoldings } from './useHoldings';
import { useFiltersStore, applyFilters, sortFlat } from './useFilters';
import { FilterBar } from './components/FilterBar';
import { HoldingRow } from './components/HoldingRow';
import { HoldingDetail } from './components/HoldingDetail';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { EmptyState } from '../../shared/components/EmptyState';
import { TIERS, bColor } from './constants';
import { usePriceCacheStore } from '../../store/priceCache';

const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY as string | undefined;

function BasketBar({ holdings }: { holdings: { basket: string; current_weight?: number | null; initial_weight?: number | null }[] }) {
  const map: Record<string, number> = {};
  holdings.forEach((h) => {
    const w = h.current_weight ?? h.initial_weight ?? 0;
    map[h.basket] = (map[h.basket] ?? 0) + w;
  });
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', padding: '8px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', height: 4, borderRadius: 3, overflow: 'hidden', marginBottom: 6, gap: 2 }}>
        {entries.map(([name, w]) => (
          <div key={name} style={{ flex: w, height: '100%', borderRadius: 2, background: bColor(name), opacity: 0.85 }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
        {entries.map(([name, w]) => {
          const pct = total > 0 ? (w / total * 100).toFixed(0) : '0';
          const c = bColor(name);
          return (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--t2)' }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: c, flexShrink: 0 }} />
              <span>{name}</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PicksPage() {
  const { data: holdings = [], isLoading, error } = useHoldings();
  const filters = useFiltersStore();
  const setPrice = usePriceCacheStore((s) => s.setPrice);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  useEffect(() => {
    if (!FINNHUB_KEY || holdings.length === 0) return;
    const tickers = holdings.map((h) => h.ticker).filter((t) => t !== 'CASH');
    tickers.forEach((ticker) => {
      fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`)
        .then((r) => r.json())
        .then((d) => { if (d.c) setPrice(ticker, d); })
        .catch(() => {});
    });
  }, [holdings.length, setPrice]);

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (error) return <EmptyState message="Failed to load holdings." />;

  const filtered = applyFilters(holdings, filters);
  const sorted = sortFlat(filtered, filters.sort);
  const selected = sorted.find((h) => h.ticker === selectedTicker) ?? null;
  const maxWeight = Math.max(...holdings.map((h) => h.current_weight ?? h.initial_weight ?? 0), 0);

  function renderGrouped() {
    const groups: Record<number, typeof sorted> = {};
    sorted.forEach((h) => { (groups[h.conviction] ??= []).push(h); });
    return [5, 4, 3, 2, 1, 0].flatMap((conv) => {
      const rows = groups[conv];
      if (!rows?.length) return [];
      const t = TIERS[conv];
      return [
        <div
          key={`hdr-${conv}`}
          style={{
            padding: '5px 14px 4px', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            position: 'sticky', top: 0, zIndex: 2,
            borderBottom: `1px solid ${t.border}`,
            background: t.bg, color: t.color,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {t.label}
          <span style={{ fontSize: 9, opacity: 0.6, fontWeight: 500 }}>{rows.length}</span>
        </div>,
        ...rows.map((h) => (
          <HoldingRow
            key={h.ticker}
            holding={h}
            isSelected={h.ticker === selectedTicker}
            maxWeight={maxWeight}
            onClick={() => setSelectedTicker(h.ticker === selectedTicker ? null : h.ticker)}
          />
        )),
      ];
    });
  }

  const listContent = filters.sort === 'conviction'
    ? renderGrouped()
    : sorted.map((h) => (
        <HoldingRow
          key={h.ticker}
          holding={h}
          isSelected={h.ticker === selectedTicker}
          maxWeight={maxWeight}
          onClick={() => setSelectedTicker(h.ticker === selectedTicker ? null : h.ticker)}
        />
      ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <BasketBar holdings={holdings} />
      <FilterBar holdings={holdings} filtered={filtered.length} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div
          style={{
            overflowY: 'auto',
            borderRight: '1px solid var(--border)',
            transition: 'flex 0.25s ease',
            flex: selected ? '0 0 42%' : 1,
          }}
        >
          {sorted.length === 0
            ? <EmptyState message="No positions match your filters." />
            : listContent}
        </div>

        {selected ? (
          <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
            <HoldingDetail
              holding={selected}
              totalCount={holdings.length}
              onClose={() => setSelectedTicker(null)}
            />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 12 }}>
            Select a position to view details
          </div>
        )}
      </div>
    </div>
  );
}
