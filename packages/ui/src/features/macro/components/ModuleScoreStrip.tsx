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
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>
              {it.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color }}>{it.score ?? '—'}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color }}>{it.detail}</span>
            </div>
            {delta && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{delta}</div>}
          </div>
        );
      })}
    </div>
  );
}
