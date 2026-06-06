import { useEffect, useState, useMemo } from 'react';
import { useHoldings } from './useHoldings';
import { useFiltersStore, applyFilters, sortFlat, sortByPnl } from './useFilters';
import { FilterBar } from './components/FilterBar';
import { HoldingRow } from './components/HoldingRow';
import { HoldingDetail } from './components/HoldingDetail';
import { PortfolioDashboard } from './components/PortfolioDashboard';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { EmptyState } from '../../primitives/EmptyState';
import { TIERS, resolvePnl, positionType, parseCostBasis } from '@stw/shared';
import { usePriceCacheStore, type Quote } from '../../store/priceCache';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCapabilities } from '../../context/AppCapabilities';
import { useUserPositions } from '../portfolio/useUserPositions';
import { cleanUnderlying } from '../portfolio/api';

const PRICE_CACHE_KEY = 'finnhub_prices';
const PRICE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

type PriceEntry = { data: Quote; ts: number };
type LocalPriceCache = Record<string, PriceEntry>;

function loadLocalPrices(): LocalPriceCache {
  try { return JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) ?? '{}'); } catch { return {}; }
}
function saveLocalPrices(c: LocalPriceCache) {
  try { localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(c)); } catch { /* storage full */ }
}

// ── Picks content (shared by web + admin) ─────────────────────
// Paywall/tier gating lives in each app shell, not here.
export function PicksView() {
  const { finnhubKey } = useCapabilities();
  const { data: holdings = [], isLoading, error } = useHoldings();
  const { data: userPositions = [] } = useUserPositions();
  const heldTickers = useMemo(
    () => new Set(userPositions.map((p) => cleanUnderlying(p.underlying))),
    [userPositions],
  );
  // Newest IBKR options-sync time across all holdings. A holding priced earlier than
  // this is stale (the last sync didn't refresh it) — passed to HoldingDetail so the
  // detail page can flag an old price instead of it looking freshly synced.
  const latestOptionsSync = useMemo<Date | null>(
    () => holdings.reduce<Date | null>((acc, h) => {
      if (!h.last_pnl_at) return acc;
      const d = new Date(h.last_pnl_at);
      return !acc || d > acc ? d : acc;
    }, null),
    [holdings],
  );
  const filters = useFiltersStore();
  const setPrice = usePriceCacheStore((s) => s.setPrice);
  const setFetchStatus = usePriceCacheStore((s) => s.setFetchStatus);
  const priceCache = usePriceCacheStore((s) => s.cache);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'overview'>('list');
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!finnhubKey || holdings.length === 0) return;

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
        fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubKey}`)
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
  }, [holdings.length, setPrice, setFetchStatus, finnhubKey]);

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (error) return <EmptyState message="Failed to load holdings." />;

  const filtered = applyFilters(holdings, filters);
  // FilterBar count excludes the CASH balance row — it's not a real position.
  const positionCount = filtered.filter((h) => h.ticker !== 'CASH').length;
  // P&L sorts need a live-price-derived map (built here, sorted in @stw/shared via
  // the same resolver the rows use). All other sorts are pure data-only.
  const sorted = (filters.sort === 'pnl_desc' || filters.sort === 'pnl_asc')
    ? sortByPnl(
        filtered,
        Object.fromEntries(filtered.map((h) => [
          h.ticker,
          resolvePnl({
            positionType: positionType(h.position_detail),
            price: priceCache[h.ticker]?.c ?? null,
            costBasis: parseCostBasis(h.position_detail),
            optionsPnlPct: h.last_pnl_pct,
          }).pnlPct,
        ])),
        filters.sort === 'pnl_desc' ? 'desc' : 'asc',
      )
    : sortFlat(filtered, filters.sort);
  const selected = sorted.find((h) => h.ticker === selectedTicker) ?? null;
  const maxWeight = Math.max(...holdings.map((h) => h.current_weight ?? h.initial_weight ?? 0), 0);

  function renderGrouped() {
    const groups: Record<number, typeof sorted> = {};
    sorted.forEach((h) => { (groups[h.conviction ?? 3] ??= []).push(h); });
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
            isUserHeld={heldTickers.has(h.ticker)}
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
          isUserHeld={heldTickers.has(h.ticker)}
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
        <FilterBar holdings={holdings} filtered={positionCount} />

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
              latestOptionsSync={latestOptionsSync}
            />
          </div>
        ) : mobileView === 'overview' ? (
          <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
            <PortfolioDashboard holdings={holdings} onSelectTicker={setSelectedTicker} />
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
      <FilterBar holdings={holdings} filtered={positionCount} />

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
              latestOptionsSync={latestOptionsSync}
            />
          ) : (
            <PortfolioDashboard holdings={holdings} onSelectTicker={setSelectedTicker} />
          )}
        </div>
      </div>
    </div>
  );
}
