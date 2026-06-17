import { fmtLegInstrument, type Leg } from '@stw/shared';
import { useLegTransactions } from '../useHoldingHistory';
import type { LegEvent } from '../api';

// The position's evolution, built from the SAME source as the legs (leg_transactions). Grouped by
// date: a position-level action header + the per-leg events under it (both grains).

function legLabel(ev: LegEvent): string {
  const l = ev.leg;
  if (!l) return 'leg';
  return fmtLegInstrument({ instrument_type: l.instrument_type, option_strike: l.option_strike, option_right: l.option_right, option_expiry: l.option_expiry } as Leg);
}

// Per-event verb + color.
function eventVerb(ev: LegEvent): { verb: string; color: string } {
  if (ev.action_type === 'EXPIRED') return { verb: 'Expired', color: '#ef4444' };
  if (ev.action_type === 'EXERCISED') return { verb: 'Exercised', color: '#3b82f6' };
  if (ev.action_type === 'SELL') return (ev.weight ?? 0) === 0 ? { verb: 'Closed', color: '#ef4444' } : { verb: 'Trimmed', color: '#f59e0b' };
  return { verb: 'Bought', color: 'var(--acc)' };  // BUY
}

// Position-level label for a day's batch of events.
function dayAction(evs: LegEvent[]): string {
  const hasClose = evs.some((e) => e.action_type === 'EXPIRED' || e.action_type === 'EXERCISED' || (e.action_type === 'SELL' && (e.weight ?? 0) === 0));
  const hasTrim = evs.some((e) => e.action_type === 'SELL' && (e.weight ?? 0) > 0);
  const hasBuy = evs.some((e) => e.action_type === 'BUY');
  if (hasBuy && (hasClose || hasTrim)) return 'Adjusted';
  if (hasClose) return 'Closed / reduced';
  if (hasTrim) return 'Trimmed';
  return 'Opened / added';
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function LegTimeline({ ticker }: { ticker: string }) {
  const { data: events = [], isLoading } = useLegTransactions(ticker);
  if (isLoading) return <div style={{ fontSize: 12, color: 'var(--t3)', padding: '8px 0' }}>Loading…</div>;
  if (events.length === 0) return <div style={{ fontSize: 12, color: 'var(--t3)', padding: '4px 0' }}>No activity yet.</div>;

  // group by calendar day, newest day first
  const byDay = new Map<string, LegEvent[]>();
  for (const e of events) {
    const d = e.executed_at.slice(0, 10);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(e);
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {days.map((d) => {
        const evs = byDay.get(d)!;
        return (
          <div key={d}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{dayAction(evs)}</span>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{fmtDate(d)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {evs.map((e) => {
                const { verb, color } = eventVerb(e);
                return (
                  <div key={e.id} style={{ fontSize: 11, color: 'var(--t2)', display: 'flex', gap: 6 }}>
                    <span style={{ color, fontWeight: 600, flexShrink: 0 }}>{verb}</span>
                    <span style={{ color: 'var(--text)' }}>{legLabel(e)}</span>
                    {e.price != null && <span style={{ color: 'var(--t3)' }}>@ ${e.price}</span>}
                    {e.action_type === 'BUY' && e.weight != null && <span style={{ color: 'var(--t3)' }}>· {e.weight}%</span>}
                    {e.notes && <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>· {e.notes}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
