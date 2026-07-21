import { useState } from 'react';
import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '@stw/shared';
import type { Signal } from '../api';

// Today's setups. Each row = the host's verdict (a fixed-width pill), the trade + trigger +
// expiry, and the GEX logic line. Verdict → tone follows the design: green → Enter (positive),
// yellow → Half size (warning), red → Skip (negative). No re-derivation — `verdict` is authored
// upstream. (The design's per-row price sparkline is intentionally omitted — see SignalsView:
// the reused GEX read carries no recent-price series and free-form triggers have no reliable
// numeric level to plot, so fabricating one is declined.)
type Role = 'positive' | 'warning' | 'negative' | 'neutral';
const VERDICT: Record<string, { role: Role; label: string }> = {
  green:  { role: 'positive', label: 'All ✓ — Enter' },
  yellow: { role: 'warning',  label: 'Half size' },
  red:    { role: 'negative', label: 'Skip today' },
};

type Tk = 'spy' | 'qqq' | 'other';
function sigTicker(s: Signal): Tk {
  const t = `${s.trade} ${s.trigger}`.toUpperCase();
  if (t.includes('QQQ')) return 'qqq';
  if (t.includes('SPY') || t.includes('SPX')) return 'spy';
  return 'other';
}

const filterBtn = (on: boolean): React.CSSProperties => ({
  padding: '2px 8px', borderRadius: 4,
  border: `1px solid ${on ? 'var(--acc)' : 'var(--border)'}`,
  background: on ? 'var(--c5bg)' : 'transparent',
  color: on ? 'var(--acc)' : 'var(--t2)',
  fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, fontFamily: 'inherit', cursor: 'pointer',
});

interface Props {
  signals: Signal[];
}

export function SignalsTable({ signals }: Props) {
  const [filter, setFilter] = useState<'all' | 'spy' | 'qqq'>('all');

  // SPY first, then QQQ, then anything else — matches the host's ordering.
  const order: Record<Tk, number> = { spy: 0, qqq: 1, other: 2 };
  const sorted = [...signals].sort((a, b) => order[sigTicker(a)] - order[sigTicker(b)]);
  const shown = sorted.filter((s) => filter === 'all' || sigTicker(s) === filter);

  const ready = signals.filter((s) => s.verdict === 'green').length;
  const half = signals.filter((s) => s.verdict === 'yellow').length;
  const skip = signals.filter((s) => s.verdict === 'red').length;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, color: 'var(--t2)' }}>📋 Today&apos;s setups</span>
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{ready} ready · {half} half size · {skip} skip</span>
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {(['all', 'spy', 'qqq'] as const).map((f) => (
            <button key={f} style={filterBtn(filter === f)} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', padding: '12px 13px' }}>No setups for this filter.</p>
      ) : (
        shown.map((s, i) => {
          const v = VERDICT[s.verdict] ?? { role: 'neutral' as Role, label: s.verdict };
          return (
            <div
              key={i}
              style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 11,
                padding: '11px 13px',
                borderBottom: i === shown.length - 1 ? '1px solid transparent' : '1px solid var(--bsub)',
              }}
            >
              {/* verdict pill (fixed 108px) */}
              <span
                style={{
                  width: 108, flexShrink: 0, textAlign: 'center',
                  fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase',
                  letterSpacing: LETTER_SPACING.label, padding: '4px 6px', borderRadius: 9999,
                  background: `var(--status-${v.role}-bg)`, color: `var(--status-${v.role}-text)`,
                  border: `1px solid var(--status-${v.role}-border)`, lineHeight: 1.3,
                }}
              >
                {v.label}
              </span>

              {/* trade + trigger */}
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{s.trade}</div>
                <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.4 }}>
                  {s.trigger}
                  {s.exp && <span style={{ color: 'var(--t3)' }}> · expires {s.exp}</span>}
                </div>
              </div>

              {/* logic (wraps below on mobile) */}
              <div style={{ flex: '1 1 230px', minWidth: 0, fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.45 }}>{s.logic}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
