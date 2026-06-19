import { useEffect, useState, useMemo, useRef } from 'react';
import { useHoldings } from './useHoldings';
import { useFiltersStore, applyFilters, sortFlat, sortByPnl } from './useFilters';
import { usePicksTabStore, coercePicksTab, PICKS_TAB_LABELS, type PicksTab } from './usePicksTab';
import { FilterBar } from './components/FilterBar';
import { HoldingRow } from './components/HoldingRow';
import { HoldingDetail } from './components/HoldingDetail';
import { PortfolioDashboard } from './components/PortfolioDashboard';
import { TradesTable } from './components/TradesTable';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { EmptyState } from '../../primitives/EmptyState';
import { TIERS, holdingPnlPct } from '@stw/shared';
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
  // Newest IBKR options-sync time across all legs. A leg priced earlier than this is stale
  // (the last sync didn't refresh it) — passed to HoldingDetail so the detail page can flag
  // an old price instead of it looking freshly synced.
  const latestOptionsSync = useMemo<Date | null>(
    () => holdings.reduce<Date | null>((acc, h) => {
      for (const leg of h.legs) {
        if (!leg.mark_price_at) continue;
        const d = new Date(leg.mark_price_at);
        if (!acc || d > acc) acc = d;
      }
      return acc;
    }, null),
    [holdings],
  );
  const filters = useFiltersStore();
  const setPrice = usePriceCacheStore((s) => s.setPrice);
  const setFetchStatus = usePriceCacheStore((s) => s.setFetchStatus);
  const priceCache = usePriceCacheStore((s) => s.cache);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  // Resizable split: the list pane's width as a % of the row; user drags the divider to set it.
  const splitRef = useRef<HTMLDivElement>(null);
  const [listPct, setListPct] = useState(42);
  const [dragging, setDragging] = useState(false);
  // When the list pane is narrow (split dragged small), rows drop their secondary badges so nothing
  // overlaps. Measured live so it tracks both the divider and window resizes.
  const listPaneRef = useRef<HTMLDivElement>(null);
  const [listW, setListW] = useState(Infinity);
  useEffect(() => {
    const el = listPaneRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setListW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedTicker]);
  const listCompact = listW < 240;
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setListPct(Math.min(80, Math.max(15, pct)));
    };
    const onUp = () => {
      setDragging(false);
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  // Active sub-tab; seeds from the user's saved default (localStorage-instant, profile-synced).
  const [activeTab, setActiveTab] = useState<PicksTab>(() => coercePicksTab(usePicksTabStore.getState().defaultTab));
  const isMobile = useIsMobile();

  // Selecting a ticker anywhere (list row, dashboard link, ledger link) lands on the
  // Ticker Details tab so the detail is visible without first switching tabs.
  function selectTicker(ticker: string | null) {
    setSelectedTicker(ticker);
    if (ticker) setActiveTab('positions');
  }

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
          holdingPnlPct(h.legs, priceCache[h.ticker]?.c ?? null),
        ])),
        filters.sort === 'pnl_desc' ? 'desc' : 'asc',
      )
    : sortFlat(filtered, filters.sort);
  // Look up the selected holding from ALL holdings, not the filtered list — otherwise
  // selecting a ticker that's filtered out (e.g. a Closed position linked from the
  // dashboard's Latest Changes) would silently open nothing.
  const selected = holdings.find((h) => h.ticker === selectedTicker) ?? null;
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
            compact={listCompact}
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
          compact={listCompact}
        />
      ));

  // ── Sub-tab bar: Portfolio Overview · Ticker Details · Transactions ──
  // Overview + Transactions are full-width peers, so the dashboard is always one click
  // away — no need to deselect a ticker to reach it.
  const TABS: PicksTab[] = ['overview', 'positions', 'trades'];
  const tabBtn = (tab: PicksTab): React.CSSProperties => ({
    flex: isMobile ? 1 : '0 0 auto',
    padding: isMobile ? '10px 0' : '9px 16px',
    fontSize: 13, background: 'none', border: 'none',
    borderBottom: '2px solid transparent', cursor: 'pointer',
    marginBottom: -1, transition: 'color 0.15s', whiteSpace: 'nowrap',
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab ? 'var(--acc)' : 'var(--t2)',
    borderBottomColor: activeTab === tab ? 'var(--acc)' : 'transparent',
  });

  // On mobile an open detail takes over the screen — hide the sub-tabs + filter bar.
  const mobileDetail = isMobile && activeTab === 'positions' && !!selected;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {!mobileDetail && (
        <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', flexShrink: 0, gap: isMobile ? 0 : 4, padding: isMobile ? 0 : '0 8px' }}>
          {TABS.map((tab) => (
            <button key={tab} style={tabBtn(tab)} onClick={() => setActiveTab(tab)}>
              {tab === 'positions' ? `${PICKS_TAB_LABELS.positions} (${positionCount})` : PICKS_TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      )}

      {/* FilterBar belongs to the position list only */}
      {activeTab === 'positions' && !mobileDetail && (
        <FilterBar holdings={holdings} filtered={positionCount} />
      )}

      {/* Portfolio Overview — full width */}
      {activeTab === 'overview' && (
        <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
          <PortfolioDashboard holdings={holdings} onSelectTicker={selectTicker} />
        </div>
      )}

      {/* Trades — full-width blotter */}
      {activeTab === 'trades' && (
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: isMobile ? '14px 12px' : '20px 24px' }}>
          <TradesTable holdings={holdings} onSelectTicker={selectTicker} />
        </div>
      )}

      {/* Ticker Details — position list + selected-holding detail */}
      {activeTab === 'positions' && (
        isMobile ? (
          selected ? (
            <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
              <HoldingDetail
                holding={selected}
                totalCount={holdings.length}
                onClose={() => setSelectedTicker(null)}
                isMobile
                latestOptionsSync={latestOptionsSync}
              />
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sorted.length === 0
                ? <EmptyState message="No positions match your filters." />
                : listContent}
            </div>
          )
        ) : (
          <div ref={splitRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div
              ref={listPaneRef}
              style={{
                // hidden-X clips list content at the divider; own stacking context (relative + zIndex 0)
                // keeps the sticky tier header (zIndex 2) from painting over the detail pane.
                overflow: 'hidden auto',
                position: 'relative', zIndex: 0,
                flexBasis: selected ? `${listPct}%` : 'auto',
                flexGrow: selected ? 0 : 1,
                flexShrink: 0,
                minWidth: 0,
                ...(dragging ? {} : { transition: 'flex-basis 0.15s ease' }),
              }}
            >
              {sorted.length === 0
                ? <EmptyState message="No positions match your filters." />
                : listContent}
            </div>
            {selected && (
              <>
                {/* Draggable divider — click and drag to set the split width */}
                <div
                  onMouseDown={startResize}
                  title="Drag to resize"
                  style={{
                    flexShrink: 0, width: 6, cursor: 'col-resize',
                    background: dragging ? 'var(--acc)' : 'var(--border)',
                    borderLeft: '1px solid var(--bsub)', borderRight: '1px solid var(--bsub)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative', zIndex: 0, background: 'var(--bg)' }}>
                  <HoldingDetail
                    holding={selected}
                    totalCount={holdings.length}
                    onClose={() => setSelectedTicker(null)}
                    latestOptionsSync={latestOptionsSync}
                  />
                </div>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}
