import { useState } from 'react';
import type { Signal } from '../api';

const VCOLS: Record<string, string> = { green: '#16A34A', yellow: '#D97706', red: '#DC2626', gray: '#9CA3AF' };
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
  fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
});

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--t3)', background: 'var(--s2)',
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
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>📋 Trade Signals</span>
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
          <p style={{ fontSize: 11, color: 'var(--t3)', padding: '12px 13px' }}>No trade signals for the latest session.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 480 }}>
            <thead>
              <tr>
                <th style={th}>Trade</th><th style={th}>Trigger</th><th style={th}>Exp</th><th style={th}>Logic (GEX)</th><th style={th}>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const tk = sigTicker(s);
                if (filter !== 'all' && tk !== filter) return null;
                const vc = VCOLS[s.verdict] ?? VCOLS.gray;
                const vl = VLBLS[s.verdict] ?? 'N/A';
                const td: React.CSSProperties = { padding: '9px 13px', borderBottom: '1px solid var(--bsub)', verticalAlign: 'top', lineHeight: 1.4 };
                return (
                  <tr key={i}>
                    <td style={td}><div style={{ fontWeight: 700, fontSize: 12 }}>{s.trade}</div></td>
                    <td style={{ ...td, color: 'var(--t2)' }}>{s.trigger}</td>
                    <td style={{ ...td, color: 'var(--t2)', whiteSpace: 'nowrap' }}>{s.exp}</td>
                    <td style={{ ...td, color: 'var(--t2)' }}>{s.logic}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: vc }} />
                        <span style={{ color: vc }}>{vl}</span>
                      </div>
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
