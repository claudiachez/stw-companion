import { fmtDateTime, formatDate, isTradingDay, lastTradingDay, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { RegimeRead, RegimeLabel } from '@stw/shared';
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

/** Latest scored session − the prior scored session (the series holds only actual
 *  trading days), so on a weekend/holiday this is Friday vs Thursday, not "today". */
function deltaVsPriorSession(series: RegimeSeriesPoint[]): number | null {
  const scored = series.filter((p) => p.score !== null);
  if (scored.length < 2) return null;
  return (scored[scored.length - 1].score as number) - (scored[scored.length - 2].score as number);
}

const Label = ({ text }: { text: string }) => (
  <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)' }}>{text}</span>
);

// Current status (left) and the 9-day history (right, right-aligned) in one plain
// card — no divider, no tinted panel. The "Updated" stamp sits beside CURRENT
// STATUS; per-day detail is a lamp-hover tooltip (see RegimeTrajectory).
export function RegimeCard({ regime, updatedAt, series }: Props) {
  if (!regime) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
        <span style={{ fontSize: FONT_SIZE.base, color: 'var(--t3)' }}>Computing market regime…</span>
      </div>
    );
  }

  const color = REGIME_COLOR[regime.label];
  const delta = deltaVsPriorSession(series);
  const n = delta === null ? null : Math.round(delta);
  const chipArrow = n === null ? '' : n > 0 ? '▲ ' : n < 0 ? '▼ ' : '';
  const chipColor = n === null || n === 0 ? 'var(--t3)' : n > 0 ? 'var(--c5)' : 'var(--c1)';
  const chipText = n === null ? '— vs prior session' : `${chipArrow}${n >= 0 ? '+' : ''}${n} vs prior session`;

  // On a non-trading day the read reflects the last close, not "now" — date it
  // honestly (e.g. Saturday shows "As of Jul 10 · market closed"), rather than
  // stamping the current wall-clock as if the market were live.
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const marketOpen = isTradingDay(todayET);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>

        {/* Left — current status, with the Updated stamp right beside the label */}
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <Label text="Current status" />
            {updatedAt && (
              <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>
                {marketOpen
                  ? <>Updated: <span style={{ color: 'var(--t2)' }}>{fmtDateTime(updatedAt)}</span></>
                  : <>As of <span style={{ color: 'var(--t2)' }}>{formatDate(lastTradingDay(todayET))}</span> · market closed</>}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <span style={{ fontSize: FONT_SIZE['2xs'], color }}>●</span>
            <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color, letterSpacing: '0.03em' }}>
              {regime.label.toUpperCase()}
            </span>
            <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', fontWeight: FONT_WEIGHT.semibold }}>{regime.score}</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: chipColor,
              background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px',
            }}>
              {chipText}
            </span>
          </div>
          <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', marginTop: 8 }}>{regime.tradingMode}</div>
        </div>

        {/* Right — 9-day history, title + lamps right-aligned */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <Label text="9-day regime" />
          <RegimeTrajectory series={series} days={9} />
        </div>

      </div>
    </div>
  );
}
