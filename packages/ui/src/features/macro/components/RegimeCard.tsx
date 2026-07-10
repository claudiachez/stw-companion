import { fmtDateTime, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { RegimeRead, RegimeLabel } from '@stw/shared';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { RegimeSeriesPoint } from '../useMacroTrendHistory';
import { RegimeTrajectory } from './RegimeTrajectory';

interface Props {
  regime: RegimeRead | null;
  updatedAt: Date | null;
  /** Per-day regime scores (oldest → newest) — drives the trend chip + trajectory. */
  series: RegimeSeriesPoint[];
}

const REGIME_COLOR: Record<RegimeLabel, string> = {
  'Risk-On':                  'var(--c5)',
  'Constructive / Selective': 'var(--c4)',
  'Cautious / Neutral':       'var(--c3)',
  'Defensive':                'var(--status-elevated)',
  'Risk-Off':                 'var(--c1)',
};

/** Today − yesterday, from the last two days that actually have a score. */
function deltaVsYesterday(series: RegimeSeriesPoint[]): number | null {
  const scored = series.filter((p) => p.score !== null);
  if (scored.length < 2) return null;
  return (scored[scored.length - 1].score as number) - (scored[scored.length - 2].score as number);
}

// Current status (left) | 9-day history (right) as two panels of one card,
// separated by a divider. Replaces the old bare banner: the arrow-and-word
// direction is now a concrete "▲ +5 vs yesterday" chip, the date is right-
// aligned in the history panel, and per-day detail is a lamp mouseover (no
// redundant caption repeating the top-left status).
export function RegimeCard({ regime, updatedAt, series }: Props) {
  const isMobile = useIsMobile();

  const shell = {
    display: 'flex',
    flexDirection: (isMobile ? 'column' : 'row') as 'column' | 'row',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
  } as const;

  if (!regime) {
    return (
      <div style={{ ...shell, padding: '16px 18px' }}>
        <span style={{ fontSize: FONT_SIZE.base, color: 'var(--t3)' }}>Computing market regime…</span>
      </div>
    );
  }

  const color = REGIME_COLOR[regime.label];
  const delta = deltaVsYesterday(series);
  const n = delta === null ? null : Math.round(delta);
  const chipArrow = n === null ? '' : n > 0 ? '▲ ' : n < 0 ? '▼ ' : '';
  const chipColor = n === null || n === 0 ? 'var(--t3)' : n > 0 ? 'var(--c5)' : 'var(--c1)';
  const chipBg = n === null || n === 0 ? 'var(--s2)' : n > 0 ? 'var(--status-positive-bg)' : 'var(--status-negative-bg)';
  const chipText = n === null ? '— vs yesterday' : `${chipArrow}${n >= 0 ? '+' : ''}${n} vs yesterday`;

  const label = (t: string) => (
    <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)' }}>{t}</div>
  );

  return (
    <div style={shell}>
      {/* Left — current status (65%) */}
      <div style={{ flex: isMobile ? '1 1 auto' : '0 0 65%', minWidth: 0, padding: '14px 16px' }}>
        {label('Current status')}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={{ fontSize: FONT_SIZE['2xs'], color }}>●</span>
          <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color, letterSpacing: '0.03em' }}>
            {regime.label.toUpperCase()}
          </span>
          <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', fontWeight: FONT_WEIGHT.semibold }}>{regime.score}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: chipColor,
            background: chipBg, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px',
          }}>
            {chipText}
          </span>
        </div>
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', marginTop: 8 }}>{regime.tradingMode}</div>
      </div>

      {/* Divider — vertical on desktop, horizontal when stacked on mobile */}
      <div style={isMobile
        ? { height: 1, background: 'var(--border)' }
        : { width: 1, background: 'var(--border)', flex: '0 0 auto' }} />

      {/* Right — 9-day history (35%) */}
      <div style={{ flex: isMobile ? '1 1 auto' : '0 0 35%', minWidth: 200, padding: '14px 16px', background: 'var(--s2)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {label('9-day regime')}
          {updatedAt && (
            <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
              Updated: <span style={{ color: 'var(--t2)' }}>{fmtDateTime(updatedAt)}</span>
            </span>
          )}
        </div>
        <RegimeTrajectory series={series} days={9} />
      </div>
    </div>
  );
}
