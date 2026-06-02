import { useEffect, useState } from 'react';
import { useHoldings } from './useHoldings';
import { useFiltersStore, applyFilters, sortFlat } from './useFilters';
import { FilterBar } from './components/FilterBar';
import { HoldingRow } from './components/HoldingRow';
import { HoldingDetail } from './components/HoldingDetail';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { EmptyState } from '../../shared/components/EmptyState';
import { AccessGate } from '../../shared/components/AccessGate';
import { TIERS, bColor, positionType, parseCostBasis } from '@stw/shared';
import { usePriceCacheStore } from '../../store/priceCache';
import { useIsMobile } from '../../shared/hooks/useIsMobile';
import { useProfile } from '../../shared/hooks/useProfile';
import { useTierAccess } from '../../shared/hooks/useTierAccess';
import type { Holding } from './api';

const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY as string | undefined;
const PRICE_CACHE_KEY = 'finnhub_prices';
const PRICE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

import type { Quote } from '../../store/priceCache';
type PriceEntry = { data: Quote; ts: number };
type LocalPriceCache = Record<string, PriceEntry>;

function loadLocalPrices(): LocalPriceCache {
  try { return JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) ?? '{}'); } catch { return {}; }
}
function saveLocalPrices(c: LocalPriceCache) {
  try { localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(c)); } catch { /* storage full */ }
}

const ET = { timeZone: 'America/New_York' };

// ── Portfolio dashboard (shown when no ticker selected) ───────
function PortfolioDashboard({ holdings }: { holdings: Holding[] }) {
  const cache = usePriceCacheStore((s) => s.cache);

  const active = holdings.filter((h) => h.ticker !== 'CASH' && h.last_action !== 'Closed');

  // Avg P&L across positions that have cost basis + live price
  const pnlValues = active
    .map((h) => {
      const cost = parseCostBasis(h.position_detail);
      const price = cache[h.ticker]?.c;
      return cost && price ? (price - cost) / cost * 100 : null;
    })
    .filter((v): v is number => v !== null);
  const avgPnl = pnlValues.length > 0
    ? pnlValues.reduce((s, v) => s + v, 0) / pnlValues.length
    : null;

  // Equity : Options ratio by portfolio weight (matches the host's Friday update)
  // Mixed positions (shares + options overlay) count as equity weight
  let equityWeight = 0;
  let optionsWeight = 0;
  active.forEach((h) => {
    const w = h.current_weight ?? h.initial_weight ?? 0;
    const t = positionType(h.position_detail);
    if (t === 'options') optionsWeight += w;
    else if (w > 0) equityWeight += w; // shares, mixed, or unclassified
  });
  const typeTotal = equityWeight + optionsWeight;
  const equityPct  = typeTotal > 0 ? Math.round(equityWeight  / typeTotal * 100) : null;
  const optionsPct = typeTotal > 0 ? Math.round(optionsWeight / typeTotal * 100) : null;

  // Sector distribution by weight
  const sectorMap: Record<string, number> = {};
  active.forEach((h) => {
    const w = h.current_weight ?? h.initial_weight ?? 0;
    sectorMap[h.basket] = (sectorMap[h.basket] ?? 0) + w;
  });
  const totalWeight = Object.values(sectorMap).reduce((s, v) => s + v, 0);
  const sectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);

  // Last updated across all holdings
  const lastUpdated = holdings.reduce<Date | null>((acc, h) => {
    if (!h.updated_at) return acc;
    const d = new Date(h.updated_at);
    return !acc || d > acc ? d : acc;
  }, null);

  const pnlColor = avgPnl != null ? (avgPnl >= 0 ? '#22c55e' : '#ef4444') : 'var(--t3)';

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 16 }}>
        Portfolio Overview
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {/* Holdings */}
        <div style={{ flex: 1, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{active.length}</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Active Holdings</div>
        </div>

        {/* Avg P&L */}
        <div style={{ flex: 1, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: pnlColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {avgPnl != null ? `${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
            Avg Return{pnlValues.length > 0 ? ` (${pnlValues.length} positions)` : ''}
          </div>
        </div>

        {/* Equity : Options weight ratio */}
        <div style={{ flex: 1, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', lineHeight: 1 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {equityPct ?? '—'}
            </span>
            <span style={{ fontSize: 18, color: 'var(--t3)', marginBottom: 1 }}>:</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
              {optionsPct ?? '—'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Equity : Options (by weight)</div>
        </div>
      </div>

      {/* Sector distribution */}
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>
        Sector Distribution
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {sectors.map(([name, w]) => {
          const pct = totalWeight > 0 ? (w / totalWeight) * 100 : 0;
          const c = bColor(name);
          return (
            <div key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)', minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: c, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginLeft: 8, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--border)' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: c, opacity: 0.85 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Last updated */}
      {lastUpdated && (
        <div style={{ marginTop: 24, fontSize: 11, color: 'var(--t3)' }}>
          Last synced:{' '}
          <span style={{ color: 'var(--t2)' }}>
            {lastUpdated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...ET })} ET
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export function PicksPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const canAccess = useTierAccess('picks');
  const { data: holdings = [], isLoading, error } = useHoldings();
  const filters = useFiltersStore();
  const setPrice = usePriceCacheStore((s) => s.setPrice);
  const setFetchStatus = usePriceCacheStore((s) => s.setFetchStatus);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'overview'>('list');
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!FINNHUB_KEY || holdings.length === 0) return;

    const tickers = holdings.map((h) => h.ticker).filter((t) => t !== 'CASH');
    const now = Date.now();
    const local = loadLocalPrices();

    // Seed Zustand from cache immediately — UI shows prices before any fetch
    tickers.forEach((ticker) => {
      const entry = local[ticker];
      if (entry && now - entry.ts < PRICE_CACHE_TTL) setPrice(ticker, entry.data);
    });

    // Only fetch tickers whose cache has expired or is missing
    const stale = tickers.filter((t) => {
      const e = local[t];
      return !e || now - e.ts >= PRICE_CACHE_TTL;
    });

    if (stale.length === 0) { setFetchStatus('done'); return; }

    setFetchStatus('fetching');
    let completed = 0;

    stale.forEach((ticker, i) => {
      // 1 100ms stagger → ~54 req/min, safely under Finnhub free-tier 60/min
      setTimeout(() => {
        fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.c) {
              setPrice(ticker, d);
              local[ticker] = { data: d, ts: now };
              saveLocalPrices(local);
            } else if (d.error) {
              console.warn(`Finnhub [${ticker}]:`, d.error);
            }
          })
          .catch((err) => console.error(`Finnhub fetch failed [${ticker}]:`, err))
          .finally(() => { if (++completed === stale.length) setFetchStatus('done'); });
      }, i * 1100);
    });
  }, [holdings.length, setPrice, setFetchStatus]);

  // Access gate: show spinner while profile loads, gate screen if no access
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

  // ── Mobile: tab bar + full-screen views ─────────────────────
  if (isMobile) {
    const tabBase: React.CSSProperties = {
      flex: 1, padding: '10px 0', fontSize: 13,
      background: 'none', border: 'none', borderBottom: '2px solid transparent',
      cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s',
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <FilterBar holdings={holdings} filtered={filtered.length} />

        {/* Tab bar — hidden while viewing a detail */}
        {!selected && (
          <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', flexShrink: 0 }}>
            <button
              style={{
                ...tabBase,
                fontWeight: mobileView === 'list' ? 600 : 400,
                color: mobileView === 'list' ? 'var(--acc)' : 'var(--t2)',
                borderBottomColor: mobileView === 'list' ? 'var(--acc)' : 'transparent',
              }}
              onClick={() => setMobileView('list')}
            >
              Positions ({sorted.length})
            </button>
            <button
              style={{
                ...tabBase,
                fontWeight: mobileView === 'overview' ? 600 : 400,
                color: mobileView === 'overview' ? 'var(--acc)' : 'var(--t2)',
                borderBottomColor: mobileView === 'overview' ? 'var(--acc)' : 'transparent',
              }}
              onClick={() => setMobileView('overview')}
            >
              Overview
            </button>
          </div>
        )}

        {/* Content area */}
        {selected ? (
          <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
            <HoldingDetail
              holding={selected}
              totalCount={holdings.length}
              onClose={() => { setSelectedTicker(null); setMobileView('list'); }}
              isMobile
            />
          </div>
        ) : mobileView === 'overview' ? (
          <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
            <PortfolioDashboard holdings={holdings} />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sorted.length === 0
              ? <EmptyState message="No positions match your filters." />
              : listContent}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop: split panel ──────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <FilterBar holdings={holdings} filtered={filtered.length} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Position list */}
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

        {/* Right panel: detail or dashboard */}
        <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
          {selected ? (
            <HoldingDetail
              holding={selected}
              totalCount={holdings.length}
              onClose={() => setSelectedTicker(null)}
            />
          ) : (
            <PortfolioDashboard holdings={holdings} />
          )}
        </div>
      </div>
    </div>
  );
}
