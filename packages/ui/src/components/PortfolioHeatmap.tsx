import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { squarify, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, SPACE, type TreemapRect } from '@stw/shared';
import { SectionHeader } from '../primitives/SectionHeader';
import { useIsMobile } from '../hooks/useIsMobile';

// Shared Portfolio Heatmap (plans/macro_dashboard_spec.md § "Phase 4: Portfolio Heatmap").
// A treemap where each box's AREA ∝ its weight and its COLOR encodes performance. Used on
// BOTH Stock Picks (STW's book, live Finnhub quotes → Today + Total modes) and My Portfolio
// (the subscriber's own IBKR positions, stored marks → Total only). One component, adapted
// by which color modes the caller can supply (`showToday`). Layout is the pure `squarify`
// util in @stw/shared — no external charting library.

export type HeatmapMode = 'today' | 'total';

export interface HeatmapCell {
  ticker: string;
  /** Box area ∝ this weight (current_weight on Stock Picks, market value on My Portfolio). */
  weight: number;
  /** Day % change (Finnhub). null when unavailable (My Portfolio has no day-change feed). */
  todayPct: number | null;
  /** Total unrealized return %. null when it can't be resolved. */
  totalPct: number | null;
  /** Sector/basket, for the "By Basket" grouping. Empty string → grouped as "Other". */
  basket: string;
}

interface PortfolioHeatmapProps {
  cells: HeatmapCell[];
  onSelectTicker?: (ticker: string) => void;
  /** Offer the "Today" color mode. Off (Total-only) where there's no day-change feed. */
  showToday?: boolean;
  title?: string;
  /** Right-aligned "Updated: …" slot passed straight through to SectionHeader. */
  updated?: React.ReactNode;
}

// ±full-saturation scale per mode: intraday moves are small (±3% is a big day), total
// returns range much wider (±25% reads as a strong position without pinning every winner).
const SCALE: Record<HeatmapMode, number> = { today: 3, total: 25 };
const GROUP_GAP = 3; // px gutter between basket blocks in "By Basket" mode

function pctFor(cell: HeatmapCell, mode: HeatmapMode): number | null {
  return mode === 'today' ? cell.todayPct : cell.totalPct;
}

// Tile background/foreground for a performance value. Colors are mixed from the P&L tokens
// toward --surface so intensity tracks magnitude while staying theme-aware (dark or light).
function tileColors(pct: number | null, mode: HeatmapMode): { bg: string; fg: string } {
  if (pct == null) return { bg: 'var(--s2)', fg: 'var(--t3)' };
  const intensity = Math.min(1, Math.abs(pct) / SCALE[mode]); // 0..1
  const mix = Math.round(12 + intensity * 62); // 12%..74% toward the P&L color
  const base = pct >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)';
  return {
    bg: `color-mix(in srgb, ${base} ${mix}%, var(--surface))`,
    // Strong tiles read best in the inverse (white-on-green) text; faint tiles keep --text.
    fg: intensity > 0.5 ? 'var(--text-inverse)' : 'var(--text)',
  };
}

function fmtPct(pct: number | null): string {
  if (pct == null) return '—';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { v: T; label: string }[];
}) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            style={{
              fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label,
              textTransform: 'uppercase', padding: '3px 9px', cursor: 'pointer', border: 'none',
              background: on ? 'var(--acc)' : 'transparent',
              color: on ? 'var(--text-inverse)' : 'var(--t2)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface PlacedTile extends TreemapRect { cell: HeatmapCell }

export function PortfolioHeatmap({ cells, onSelectTicker, showToday = false, title = 'Portfolio Heatmap', updated }: PortfolioHeatmapProps) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<HeatmapMode>(showToday ? 'today' : 'total');
  const [group, setGroup] = useState<'all' | 'basket'>('all');

  // Measure the container width so the treemap lays out in real pixels — that lets us gate
  // per-tile text on the tile's actual rendered size (labels stay tappable, never clipped).
  // Measure synchronously via clientWidth (reliable across environments), keep a window
  // resize listener as the responsive fallback, and use ResizeObserver where available for
  // panel-level resizes that don't fire a window event.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => { const w = el.clientWidth; if (w > 0) setWidth(w); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const valid = useMemo(() => cells.filter((c) => c.weight > 0), [cells]);
  const height = width > 0
    ? (isMobile ? Math.round(width * 1.15) : Math.min(460, Math.max(300, Math.round(width * 0.42))))
    : 0;

  const tiles = useMemo<PlacedTile[]>(() => {
    if (width <= 0 || height <= 0 || valid.length === 0) return [];
    if (group === 'all') {
      return squarify(valid.map((c) => c.weight), width, height)
        .map((r) => ({ ...r, cell: valid[r.index] }));
    }
    // By Basket: two-level treemap — first partition the canvas among baskets by summed
    // weight, then squarify each basket's cells inside its block.
    const byBasket = new Map<string, HeatmapCell[]>();
    for (const c of valid) {
      const k = c.basket || 'Other';
      if (!byBasket.has(k)) byBasket.set(k, []);
      byBasket.get(k)!.push(c);
    }
    const groups = [...byBasket.entries()].map(([basket, gcells]) => ({
      basket, gcells, weight: gcells.reduce((s, c) => s + c.weight, 0),
    }));
    const blocks = squarify(groups.map((g) => g.weight), width, height);
    const out: PlacedTile[] = [];
    for (const b of blocks) {
      const g = groups[b.index];
      // inset each block so basket boundaries are legible
      const bx = b.x + GROUP_GAP / 2, by = b.y + GROUP_GAP / 2;
      const bw = Math.max(1, b.w - GROUP_GAP), bh = Math.max(1, b.h - GROUP_GAP);
      for (const r of squarify(g.gcells.map((c) => c.weight), bw, bh)) {
        out.push({ index: r.index, x: bx + r.x, y: by + r.y, w: r.w, h: r.h, cell: g.gcells[r.index] });
      }
    }
    return out;
  }, [valid, width, height, group]);

  if (valid.length === 0) return null;

  const scale = SCALE[mode];

  return (
    <div>
      <SectionHeader title={title} right={updated} />
      {/* Controls: color mode (Today|Total, when both exist) + grouping (All|By Basket) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: SPACE[2], marginBottom: SPACE[2] }}>
        {showToday && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[{ v: 'today', label: 'Today' }, { v: 'total', label: 'Total' }]}
          />
        )}
        <Segmented
          value={group}
          onChange={setGroup}
          options={[{ v: 'all', label: 'All' }, { v: 'basket', label: 'By Basket' }]}
        />
        {/* Legend — what the color means + its saturation scale */}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], marginLeft: 'auto', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>−{scale}%</span>
          <span style={{ width: 64, height: 8, borderRadius: 2, background: 'linear-gradient(to right, var(--pnl-loss), var(--surface), var(--pnl-gain))', border: '1px solid var(--border)' }} />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>+{scale}%</span>
        </div>
      </div>

      <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: height || (isMobile ? 400 : 320), borderRadius: 8, overflow: 'hidden', background: 'var(--bg)' }}>
        {tiles.map((t) => {
          const pct = pctFor(t.cell, mode);
          const { bg, fg } = tileColors(pct, mode);
          const showTicker = t.w >= 26 && t.h >= 15;
          const showValue = t.w >= 48 && t.h >= 30;
          const tickerFont = t.w >= 96 && t.h >= 58 ? FONT_SIZE.lg : t.w >= 56 && t.h >= 34 ? FONT_SIZE.base : FONT_SIZE.xs;
          return (
            <button
              key={t.cell.ticker}
              onClick={() => onSelectTicker?.(t.cell.ticker)}
              title={`${t.cell.ticker} · ${fmtPct(pct)}${t.cell.basket ? ` · ${t.cell.basket}` : ''}`}
              style={{
                position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h,
                boxSizing: 'border-box', border: '1px solid var(--bg)', margin: 0, padding: 0,
                background: bg, color: fg, cursor: onSelectTicker ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
                overflow: 'hidden', textAlign: 'left',
              }}
            >
              {showTicker && (
                <span style={{ padding: '0 5px', fontSize: tickerFont, fontWeight: FONT_WEIGHT.bold, lineHeight: 1.05, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.cell.ticker}
                </span>
              )}
              {showValue && (
                <span style={{ padding: '0 5px', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPct(pct)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
