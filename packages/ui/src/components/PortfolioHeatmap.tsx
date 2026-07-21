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
  /** STW's thematic basket, for the "By Basket" grouping. Empty → grouped as "Other". */
  basket: string;
  /** Market sector (ticker_sector_map), for the "By Sector" grouping. null → "Other". */
  sector: string | null;
}

type GroupMode = 'all' | 'basket' | 'sector';
const GROUP_LABEL_H = 15; // px strip reserved at the top of a group block for its name

interface PortfolioHeatmapProps {
  cells: HeatmapCell[];
  onSelectTicker?: (ticker: string) => void;
  /** Offer the "Today" color mode. Off (Total-only) where there's no day-change feed. */
  showToday?: boolean;
  title?: string;
  /** Right-aligned "Updated: …" slot passed straight through to SectionHeader. */
  updated?: React.ReactNode;
  /** Initial grouping (All | By Basket | By Sector). Defaults to 'all' so existing
   * callers (My Portfolio) are unchanged; Stock Picks' "The book" opens on 'basket'. */
  defaultGroup?: GroupMode;
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
interface GroupBlock { label: string; x: number; y: number; w: number; h: number }

export function PortfolioHeatmap({ cells, onSelectTicker, showToday = false, title = 'Portfolio Heatmap', updated, defaultGroup = 'all' }: PortfolioHeatmapProps) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<HeatmapMode>(showToday ? 'today' : 'total');
  const [group, setGroup] = useState<GroupMode>(defaultGroup);

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

  const { tiles, groupBlocks } = useMemo<{ tiles: PlacedTile[]; groupBlocks: GroupBlock[] }>(() => {
    if (width <= 0 || height <= 0 || valid.length === 0) return { tiles: [], groupBlocks: [] };
    if (group === 'all') {
      return {
        tiles: squarify(valid.map((c) => c.weight), width, height).map((r) => ({ ...r, cell: valid[r.index] })),
        groupBlocks: [],
      };
    }
    // By Basket / By Sector: two-level treemap — partition the canvas among groups by
    // summed weight, reserve a label strip at the top of each block, then squarify that
    // group's cells in the region below so the grouping is legible (which block = which).
    const keyOf = (c: HeatmapCell) => (group === 'sector' ? (c.sector || 'Other') : (c.basket || 'Other'));
    const byGroup = new Map<string, HeatmapCell[]>();
    for (const c of valid) {
      const k = keyOf(c);
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k)!.push(c);
    }
    const groups = [...byGroup.entries()].map(([label, gcells]) => ({
      label, gcells, weight: gcells.reduce((s, c) => s + c.weight, 0),
    }));
    const blocks = squarify(groups.map((g) => g.weight), width, height);
    const outTiles: PlacedTile[] = [];
    const outBlocks: GroupBlock[] = [];
    for (const b of blocks) {
      const g = groups[b.index];
      const bx = b.x + GROUP_GAP / 2, by = b.y + GROUP_GAP / 2;
      const bw = Math.max(1, b.w - GROUP_GAP), bh = Math.max(1, b.h - GROUP_GAP);
      outBlocks.push({ label: g.label, x: bx, y: by, w: bw, h: bh });
      // Only reserve the label strip when the block is tall enough to still show tiles.
      const labelH = bh > GROUP_LABEL_H * 2.2 ? GROUP_LABEL_H : 0;
      const cy = by + labelH, ch = bh - labelH;
      for (const r of squarify(g.gcells.map((c) => c.weight), bw, ch)) {
        outTiles.push({ index: r.index, x: bx + r.x, y: cy + r.y, w: r.w, h: r.h, cell: g.gcells[r.index] });
      }
    }
    return { tiles: outTiles, groupBlocks: outBlocks };
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
          options={[{ v: 'all', label: 'All' }, { v: 'basket', label: 'Basket' }, { v: 'sector', label: 'Sector' }]}
        />
        {/* Legend — what the color means + its saturation scale */}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], marginLeft: 'auto', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>−{scale}%</span>
          <span style={{ width: 64, height: 8, borderRadius: 2, background: 'linear-gradient(to right, var(--pnl-loss), var(--surface), var(--pnl-gain))', border: '1px solid var(--border)' }} />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>+{scale}%</span>
        </div>
      </div>

      <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: height || (isMobile ? 400 : 320), borderRadius: 8, overflow: 'hidden', background: 'var(--bg)' }}>
        {/* Group-name labels (By Basket / By Sector) — a header strip per block so it's
            clear which group each cluster of tiles belongs to. */}
        {groupBlocks.map((b) => (
          <div
            key={b.label}
            style={{
              position: 'absolute', left: b.x, top: b.y, width: b.w, height: GROUP_LABEL_H,
              padding: '0 5px', display: 'flex', alignItems: 'center', pointerEvents: 'none',
              fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label,
              textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {b.label}
          </div>
        ))}
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
