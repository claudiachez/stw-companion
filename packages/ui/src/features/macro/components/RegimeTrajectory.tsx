import { regimeBand, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { RegimeSeriesPoint } from '../useMacroTrendHistory';

interface Props {
  /** Per-day regime scores, oldest → newest (from useMacroTrendHistory). */
  series: RegimeSeriesPoint[];
  /** How many recent trading days to show. */
  days?: number;
}

// A lamp per recent trading day, colored by that day's overall regime — read
// left→right to see whether the backdrop is improving or deteriorating into
// today. Collapses the 5 regime bands to 3 lamp colors (green/amber/red);
// a day with no reading shows a hollow lamp rather than a fabricated color.
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function lampColor(score: number | null): string {
  if (score === null) return 'transparent';
  if (score >= 60) return 'var(--c5)';  // Risk-On / Constructive
  if (score >= 45) return 'var(--c3)';  // Cautious / Neutral
  return 'var(--c1)';                    // Defensive / Risk-Off
}

// ET calendar day, matching the snapshot writer's snapshot_date.
function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// Parse a 'YYYY-MM-DD' string into its weekday letter without timezone drift.
function weekdayLetter(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '·';
  return WEEKDAY[new Date(y, m - 1, d).getDay()];
}

export function RegimeTrajectory({ series, days = 10 }: Props) {
  if (series.length < 2) {
    return (
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 6 }}>
        Regime trajectory builds as daily readings accrue.
      </div>
    );
  }

  const recent = series.slice(-days);
  const today = todayStr();

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
      {recent.map((pt, i) => {
        const isNow = pt.date === today;
        const label = isNow ? 'Now' : weekdayLetter(pt.date);
        const color = lampColor(pt.score);
        const band = pt.score === null ? 'no reading' : regimeBand(pt.score).label;
        return (
          <div
            key={`${pt.date}-${i}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
            title={`${pt.date} · ${band}${pt.score === null ? '' : ` (${pt.score})`}`}
          >
            <span
              aria-label={`${pt.date}: ${band}`}
              style={{
                width: 14, height: 14, borderRadius: '50%',
                background: color,
                border: pt.score === null ? '1.5px dashed var(--t3)' : 'none',
                boxShadow: isNow && pt.score !== null ? `0 0 6px ${color}` : 'none',
              }}
            />
            <span style={{
              fontSize: FONT_SIZE['2xs'],
              color: isNow ? 'var(--text)' : 'var(--t3)',
              fontWeight: isNow ? FONT_WEIGHT.semibold : undefined,
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
