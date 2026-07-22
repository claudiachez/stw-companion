import { fmtDateTime, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { Card, CardHeader, HelpPanel, bandColor } from './macroVisuals';

export interface SleeveItem {
  key: string;
  name: string;
  /** Weight in the verdict, pre-formatted, e.g. "30%". */
  weight: string;
  score: number | null;
  /** Status word for the sleeve, e.g. "Momentum" / "Calm" / "Widening". */
  note: string;
  /** Score delta over the best-available lookback; null until enough history accrues. */
  delta?: number | null;
  /** Lookback label for the delta — 5D when history allows, else 3D. */
  deltaLabel?: '3D' | '5D';
}

interface Props {
  items: SleeveItem[];
  helpOpen: boolean;
  onToggleHelp: () => void;
  help: React.ReactNode;
  updatedAt?: Date | string | null;
}

function deltaText(d: number | null | undefined, label: '3D' | '5D' = '5D'): { text: string; color: string } {
  if (d === null || d === undefined) return { text: `${label} —`, color: 'var(--t3)' };
  const n = Math.round(d);
  const arrow = n > 0 ? '↑' : n < 0 ? '↓' : '→';
  const color = n > 0 ? 'var(--status-positive-text)' : n < 0 ? 'var(--status-negative-text)' : 'var(--t3)';
  return { text: `${arrow} ${n >= 0 ? '+' : ''}${n} ${label}`, color };
}

// "What's driving it" — the five weighted sleeves that compose the verdict, each a
// name+weight, a score bar (green ≥60 / amber 45–59 / red <45 via bandColor), the
// score, a status note, and its lookback delta arrow. Pure re-layout: the scores,
// labels and deltas all arrive already computed from the same shared scorers the
// regime engine uses — nothing is re-derived here.
export function SleeveDriversCard({ items, helpOpen, onToggleHelp, help, updatedAt }: Props) {
  return (
    <Card>
      <CardHeader title="What's driving it" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 2, marginBottom: 10 }}>
        Five inputs, each scored 0–100 — higher is more risk-on. The arrow is the change in each score.
      </div>
      {helpOpen && <HelpPanel>{help}</HelpPanel>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map((sl) => {
          const color = bandColor(sl.score);
          const d = deltaText(sl.delta, sl.deltaLabel);
          const width = sl.score === null ? 0 : Math.max(0, Math.min(100, sl.score));
          return (
            <div key={sl.key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ width: 118, flexShrink: 0, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t2)', whiteSpace: 'nowrap' }}>
                {sl.name} <span style={{ fontSize: FONT_SIZE['3xs'], color: 'var(--t3)' }}>{sl.weight}</span>
              </span>
              <span style={{ flex: 1, minWidth: 120, height: 6, borderRadius: 3, background: 'var(--bsub)', position: 'relative' }}>
                <span style={{ display: 'block', height: '100%', width: `${width}%`, borderRadius: 3, background: color }} />
              </span>
              <span style={{ width: 30, flexShrink: 0, textAlign: 'right', fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color, fontVariantNumeric: 'tabular-nums' }}>
                {sl.score ?? '—'}
              </span>
              <span style={{ width: 150, flexShrink: 0, fontSize: FONT_SIZE.xs, color: 'var(--t2)' }}>{sl.note}</span>
              <span style={{ width: 56, flexShrink: 0, textAlign: 'right', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: d.color, fontVariantNumeric: 'tabular-nums' }}>
                {d.text}
              </span>
            </div>
          );
        })}
      </div>

      {updatedAt && (
        <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 10 }}>
          Updated: {fmtDateTime(updatedAt)}
        </div>
      )}
    </Card>
  );
}
