import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { TIERS, holdingPnlPct, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { usePriceCacheStore } from '../../store/priceCache';
import { useLiveQuotes } from '../../hooks/useLiveQuotes';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCapabilities } from '../../context/AppCapabilities';
import { useUserPositions } from '../portfolio/useUserPositions';
import { cleanUnderlying } from '../portfolio/api';
import { useTickerRegime } from './useTickerRegime';
import { useSectorMap } from '../limits/useRiskConfig';

// ── Picks content (shared by web + admin) ─────────────────────
// Paywall/tier gating lives in each app shell, not here.
export function PicksView() {
  const { finnhubKey, twelveDataKey } = useCapabilities();
  const { data: holdings = [], isLoading, error } = useHoldings();
  const { data: userPositions = [] } = useUserPositions();
  const heldTickers = useMemo(
    () => new Set(userPositions.map((p) => cleanUnderlying(p.underlying))),
    [userPositions],
  );
  const positionTickers = useMemo(
    () => holdings.map((h) => h.ticker).filter((t) => t !== 'CASH'),
    [holdings],
  );
  // Per-ticker regime badge (own trend structure + sector standing) — computed once
  // here and passed down to both the list rows and the detail view.
  const { regimes } = useTickerRegime(positionTickers, finnhubKey, twelveDataKey);
  const { data: sectorMap = {} } = useSectorMap();
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
  useLiveQuotes(positionTickers, finnhubKey);
  const priceCache = usePriceCacheStore((s) => s.cache);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  // Resizable split: the list pane's width as a % of the row; user drags the divider to set it.
  const splitRef = useRef<HTMLDivElement>(null);
  const [listPct, setListPct] = useState(55);
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

  // Cross-route deep link: another page (e.g. My Portfolio) can navigate to
  // `/picks?ticker=XYZ` to open a holding's detail. Consume the param once, then
  // strip it so a refresh/back doesn't re-open it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const t = searchParams.get('ticker');
    if (!t) return;
    selectTicker(t.toUpperCase());
    const next = new URLSearchParams(searchParams);
    next.delete('ticker');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (error) return <EmptyState message="Failed to load holdings." />;

  // Base data-only filters (shared) then the UI-only regime/sector axes. Regime + GICS
  // sector aren't on the Holding row — they come from the per-ticker technical pass
  // (useTickerRegime) and ticker_sector_map — so the predicate is applied here at the
  // call site, not in the shared filters.ts. A row whose regime is still loading/unknown
  // is excluded while a band is active (it isn't a confirmed match).
  const filtered = applyFilters(holdings, filters).filter((h) => {
    if (filters.structure && regimes[h.ticker]?.bucket !== filters.structure) return false;
    if (filters.standing && regimes[h.ticker]?.standing !== filters.standing) return false;
    if (filters.sector && (sectorMap[h.ticker] ?? '') !== filters.sector) return false;
    return true;
  });
  // FilterBar count excludes the CASH balance row — it's not a real position.
  const positionCount = filtered.filter((h) => h.ticker !== 'CASH').length;
  // GICS market sectors present across all holdings (for the Sector dropdown).
  const sectorOptions = [...new Set(holdings.map((h) => sectorMap[h.ticker]).filter((s): s is string => !!s))].sort();
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
            padding: '5px 14px 4px', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            position: 'sticky', top: 0, zIndex: 2,
            borderBottom: `1px solid ${t.border}`,
            background: t.bg, color: t.color,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {t.label}
          <span style={{ fontSize: FONT_SIZE['2xs'], opacity: 0.6, fontWeight: FONT_WEIGHT.medium }}>{rows.length}</span>
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
            regime={regimes[h.ticker]}
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
          regime={regimes[h.ticker]}
        />
      ));

  // ── Sub-tab bar: Portfolio Overview · Ticker Details · Transactions ──
  // Overview + Transactions are full-width peers, so the dashboard is always one click
  // away — no need to deselect a ticker to reach it.
  const TABS: PicksTab[] = ['overview', 'positions', 'trades'];
  const tabBtn = (tab: PicksTab): React.CSSProperties => ({
    flex: isMobile ? 1 : '0 0 auto',
    padding: isMobile ? '10px 0' : '9px 16px',
    fontSize: FONT_SIZE.base, background: 'none', border: 'none',
    borderBottom: '2px solid transparent', cursor: 'pointer',
    marginBottom: -1, transition: 'color 0.15s', whiteSpace: 'nowrap',
    // 400 stays a literal — FONT_WEIGHT has no "normal" step (medium/semibold/bold only,
    // per tokens.ts: "already consistent (600/700 dominate)"), and fontWeight isn't part
    // of the lint-enforced scope anyway (only color + fontSize are).
    fontWeight: activeTab === tab ? FONT_WEIGHT.semibold : 400,
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
        <FilterBar holdings={holdings} sectors={sectorOptions} filtered={positionCount} />
      )}

      {/* Portfolio Overview — full width */}
      {activeTab === 'overview' && (
        <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
          <PortfolioDashboard holdings={holdings} onSelectTicker={selectTicker} />
        </div>
      )}

      {/* Trades — full-width blotter. TradesTable owns its own layout (full-bleed filter bar +
          padded scroll area), mirroring the FilterBar + list of the Ticker Details tab. */}
      {activeTab === 'trades' && (
        <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
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
                regime={regimes[selected.ticker]}
              />
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'hidden', padding: 12, background: 'var(--bg)' }}>
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ flexShrink: 0, padding: '6px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>Stock Picks · Ticker Details</div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {sorted.length === 0
                    ? <EmptyState message="No positions match your filters." />
                    : listContent}
                </div>
              </div>
            </div>
          )
        ) : (
          <div ref={splitRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div
              ref={listPaneRef}
              style={{
                // The list scrolls INSIDE the pane card below; the pane only clips. Own stacking
                // context (relative + zIndex 0) keeps the sticky tier header from painting over
                // the detail pane. Contained (maxWidth + pad) when full-width; fills the pane when split.
                overflow: 'hidden',
                position: 'relative', zIndex: 0,
                flexBasis: selected ? `${listPct}%` : 'auto',
                flexGrow: selected ? 0 : 1,
                flexShrink: 0,
                minWidth: 0,
                padding: selected ? 0 : '16px 20px',
                background: 'var(--bg)',
                ...(dragging ? {} : { transition: 'flex-basis 0.15s ease' }),
              }}
            >
              <div style={{ height: '100%', maxWidth: selected ? undefined : 1100, margin: selected ? undefined : '0 auto', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ flexShrink: 0, padding: '6px 14px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>Stock Picks · Ticker Details</div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {sorted.length === 0
                    ? <EmptyState message="No positions match your filters." />
                    : listContent}
                </div>
              </div>
            </div>
            {selected && (
              <>
                {/* Draggable divider — click and drag to set the split width (matches Portfolio) */}
                <div
                  onMouseDown={startResize}
                  title="Drag to resize"
                  style={{
                    flexShrink: 0, width: 5, cursor: 'col-resize',
                    background: dragging ? 'var(--acc)' : 'var(--border)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative', zIndex: 0, borderLeft: '1px solid var(--bsub)' }}>
                  <HoldingDetail
                    holding={selected}
                    totalCount={holdings.length}
                    onClose={() => setSelectedTicker(null)}
                    latestOptionsSync={latestOptionsSync}
                    regime={regimes[selected.ticker]}
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
