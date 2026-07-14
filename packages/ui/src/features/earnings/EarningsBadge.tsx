import { formatDate, earningsHourLabel, earningsProximity, daysUntil, FONT_SIZE, type EarningsEvent } from '@stw/shared';

/**
 * Compact header-strip chip for a ticker's next earnings report. Amber when the
 * print is imminent (≤3 days) — that's when the single-name volatility risk is
 * live. Used on both detail panes (Stock Picks + My Portfolio).
 */
export function EarningsBadge({ event }: { event: EarningsEvent }) {
  const soon = daysUntil(event.date) <= 3;
  const hour = earningsHourLabel(event.hour);
  const parts = [`Earnings ${formatDate(event.date)}`, hour, earningsProximity(event.date)].filter(Boolean);
  return (
    <span
      style={{
        fontSize: FONT_SIZE['2xs'], padding: '2px 6px', borderRadius: 4,
        color: soon ? 'var(--c3)' : 'var(--t2)',
        background: 'var(--s2)', border: `1px solid ${soon ? 'var(--c3)' : 'var(--bsub)'}`,
      }}
    >
      {parts.join(' · ')}
    </span>
  );
}
