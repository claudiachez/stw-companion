import { useState } from 'react';
import { regimeBand, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { RegimeSeriesPoint } from '../useMacroTrendHistory';

interface Props {
  /** Per-day regime scores, oldest → newest (from useMacroTrendHistory). */
  series: RegimeSeriesPoint[];
  /** Window width; short history left-pads with hollow "no data yet" lamps.
   *  9 to match the 9-day EMA used elsewhere in the macro calcs. */
  days?: number;
}

// A lamp per recent trading day, colored by that day's overall regime — read
// left→right to see whether the backdrop is improving or deteriorating into
// today. Collapses the 5 regime bands to 3 lamp colors (green/amber/red). The
// window is always `days` wide: days with no snapshot yet render as hollow lamps
// so it reads as "history still accruing", never a fabricated color. Hovering a
// lamp shows that day's date · regime · score in a small popover (a real tooltip,
// not the browser's title-attribute "?" cursor).
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const SLOT_W = 20; // fixed slot width so lamps never shift on hover

interface Slot { date: string; score: number | null; placeholder: boolean }

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

function tipText(slot: Slot): string {
  if (slot.placeholder) return 'No snapshot for this day yet';
  const band = slot.score === null ? 'No reading' : regimeBand(slot.score).label;
  return `${slot.date} · ${band}${slot.score === null ? '' : ` · ${slot.score}`}`;
}

export function RegimeTrajectory({ series, days = 9 }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (series.length < 2) {
    return (
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>
        Regime trajectory builds as daily readings accrue.
      </div>
    );
  }

  const today = todayStr();
  const real: Slot[] = series.slice(-days).map((p) => ({ date: p.date, score: p.score, placeholder: false }));
  const pad = Math.max(0, days - real.length);
  const slots: Slot[] = [...Array.from({ length: pad }, (): Slot => ({ date: '', score: null, placeholder: true })), ...real];
  const active = hovered !== null ? slots[hovered] : null;

  return (
    // inline-flex so the box hugs the lamps; the tooltip anchors to the right edge
    // (the row is right-aligned by the parent) so it never overflows the card.
    <div style={{ position: 'relative', display: 'inline-flex', gap: 4 }} onMouseLeave={() => setHovered(null)}>
      {slots.map((slot, i) => {
        const isNow = !slot.placeholder && slot.date === today;
        const label = slot.placeholder ? '·' : isNow ? 'Now' : weekdayLetter(slot.date);
        const color = lampColor(slot.score);
        return (
          <div
            key={slot.placeholder ? `pad-${i}` : `${slot.date}-${i}`}
            onMouseEnter={() => setHovered(i)}
            style={{ width: SLOT_W, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
          >
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: color,
              border: slot.score === null ? '1.5px dashed var(--t3)' : 'none',
              boxShadow: isNow && slot.score !== null ? `0 0 5px ${color}` : 'none',
            }} />
            <span style={{
              fontSize: FONT_SIZE['3xs'],
              color: isNow ? 'var(--text)' : 'var(--t3)',
              fontWeight: isNow ? FONT_WEIGHT.semibold : undefined,
            }}>
              {label}
            </span>
          </div>
        );
      })}
      {active && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 30,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          fontSize: FONT_SIZE.xs, color: 'var(--t2)',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
          padding: '5px 9px', boxShadow: 'var(--shadow)',
        }}>
          {tipText(active)}
        </div>
      )}
    </div>
  );
}
