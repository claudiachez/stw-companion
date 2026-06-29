import type { LogEntry } from '../api';

export function DayLog({ log, date }: { log: LogEntry[]; date?: string }) {
  const dateLabel = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>📝 Day Log</span>
        {dateLabel && <span style={{ fontSize: 10, color: 'var(--t3)' }}>{dateLabel}</span>}
      </div>
      {log.map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 13px', borderBottom: i === log.length - 1 ? '1px solid transparent' : '1px solid var(--bsub)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', whiteSpace: 'nowrap', minWidth: 54, paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {m.time}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{m.content}</span>
        </div>
      ))}
    </div>
  );
}
