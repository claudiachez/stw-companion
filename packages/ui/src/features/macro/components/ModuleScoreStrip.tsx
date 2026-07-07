import { FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { scoreColor } from './macroVisuals';

export interface ModuleStripItem {
  key: string;
  title: string;
  score: number | null;
  detail: string;
  /** Score delta over the lookback window (P2 trend engine); null until enough history exists. */
  fiveDayDelta?: number | null;
  /** Lookback label for the delta above — defaults to 5D. GEX uses 3D (it moves fast). */
  deltaLabel?: '3D' | '5D';
}

interface Props {
  items: ModuleStripItem[];
}

function deltaText(d: number | null | undefined, label: '3D' | '5D' = '5D'): string | null {
  if (d === null || d === undefined) return null;
  return `${label} ${d >= 0 ? '+' : ''}${Math.round(d)}`;
}

export function ModuleScoreStrip({ items }: Props) {
  return (
    // Horizontal scroll on mobile; the cards lay out in one full row on desktop.
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
      {items.map((it) => {
        const color = scoreColor(it.score);
        const delta = deltaText(it.fiveDayDelta, it.deltaLabel);
        return (
          <div
            key={it.key}
            style={{
              flex: '1 0 auto', minWidth: 120,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>
              {it.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              {/* Not KpiCard: `detail` shares the score's own risk color (scoreColor), while
                  KpiCard's secondaryValue always renders muted (var(--t2)) — using it here
                  would mute exactly the signal this strip exists to draw the eye to. */}
              {/* 22 collapses into `display` (26) per tokens.md's type-scale rule. */}
              <span style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color }}>{it.score ?? '—'}</span>
              <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color }}>{it.detail}</span>
            </div>
            {delta && <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 1 }}>{delta}</div>}
          </div>
        );
      })}
    </div>
  );
}
