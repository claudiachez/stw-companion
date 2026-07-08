import { useState } from 'react';
import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '@stw/shared';
import { StatusPill, type StatusPillVariant } from '../../../primitives/StatusPill';
import type { Signal } from '../api';

// Verdict → StatusPill variant (fixes a real bug: this used to be a literal-hex VCOLS map
// — #16A34A/#D97706/#DC2626/#9CA3AF — the same light-theme-hardcoded-color pattern flagged
// in docs/design-system/audit/04-additional-inconsistencies.md §2. green→ok, yellow→near,
// red→breach, gray→neutral, per docs/design-system/migration-plan.md's GEX Signals section.
const VVARIANT: Record<string, StatusPillVariant> = { green: 'ok', yellow: 'near', red: 'breach', gray: 'neutral' };
const VLBLS: Record<string, string> = { green: 'All ✓ — Enter', yellow: 'Partial — Half size', red: 'Skip', gray: 'N/A' };

type Tk = 'spy' | 'qqq' | 'other';

function sigTicker(s: Signal): Tk {
  const t = `${s.trade} ${s.trigger}`.toUpperCase();
  if (t.includes('QQQ')) return 'qqq';
  if (t.includes('SPY') || t.includes('SPX')) return 'spy';
  return 'other';
}

const filterBtn = (on: boolean): React.CSSProperties => ({
  padding: '2px 7px', borderRadius: 4,
  border: `1px solid ${on ? 'var(--acc)' : 'var(--border)'}`,
  background: on ? 'var(--c5bg)' : 'transparent',
  color: on ? 'var(--acc)' : 'var(--t2)',
  fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, fontFamily: 'inherit', cursor: 'pointer',
});

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase',
  letterSpacing: LETTER_SPACING.label, color: 'var(--t3)', background: 'var(--s2)',
  padding: '7px 13px', borderBottom: '1px solid var(--bsub)',
};

interface Props {
  signals: Signal[];
}

export function SignalsTable({ signals }: Props) {
  const [filter, setFilter] = useState<'all' | 'spy' | 'qqq'>('all');

  // SPY first, then QQQ, then anything else — matches the host's ordering.
  const order: Record<Tk, number> = { spy: 0, qqq: 1, other: 2 };
  const sorted = [...signals].sort((a, b) => order[sigTicker(a)] - order[sigTicker(b)]);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>📋 Trade Signals</span>
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {(['all', 'spy', 'qqq'] as const).map((f) => (
            <button key={f} style={filterBtn(filter === f)} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 9 }}>
        {sorted.length === 0 ? (
          <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', padding: '12px 13px' }}>No trade signals for the latest session.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT_SIZE.xs, minWidth: 480 }}>
            <thead>
              <tr>
                <th style={th}>Trade</th><th style={th}>Trigger</th><th style={th}>Exp</th><th style={th}>Logic (GEX)</th><th style={th}>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const tk = sigTicker(s);
                if (filter !== 'all' && tk !== filter) return null;
                const vv = VVARIANT[s.verdict] ?? 'neutral';
                const vl = VLBLS[s.verdict] ?? 'N/A';
                const td: React.CSSProperties = { padding: '9px 13px', borderBottom: '1px solid var(--bsub)', verticalAlign: 'top', lineHeight: 1.4 };
                return (
                  <tr key={i}>
                    <td style={td}><div style={{ fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.sm }}>{s.trade}</div></td>
                    <td style={{ ...td, color: 'var(--t2)' }}>{s.trigger}</td>
                    <td style={{ ...td, color: 'var(--t2)', whiteSpace: 'nowrap' }}>{s.exp}</td>
                    <td style={{ ...td, color: 'var(--t2)' }}>{s.logic}</td>
                    <td style={td}>
                      <StatusPill variant={vv}>{vl}</StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
