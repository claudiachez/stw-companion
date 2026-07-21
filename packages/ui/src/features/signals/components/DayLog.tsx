import { FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { LogEntry } from '../api';

// "How the session unfolded" — the host's time-stamped stream, straight from the reused
// GEX read's `log`. Time (56px) + text rows.
export function DayLog({ log, date }: { log: LogEntry[]; date?: string }) {
  const dateLabel = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>How the session unfolded</span>
        {dateLabel && <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>{dateLabel}</span>}
      </div>
      {log.map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 16px', borderBottom: i === log.length - 1 ? '1px solid transparent' : '1px solid var(--bsub)' }}>
          <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t3)', whiteSpace: 'nowrap', minWidth: 56, paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {m.time}
          </span>
          <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--text)', lineHeight: 1.5 }}>{m.content}</span>
        </div>
      ))}
    </div>
  );
}
