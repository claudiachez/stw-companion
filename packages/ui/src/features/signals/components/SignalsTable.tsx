import { useState } from 'react';
import { FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { useSignalCloses } from '../useSignalCloses';
import type { Signal } from '../api';

// Today's setups. Each row = the host's verdict (a fixed-width pill), the trade + trigger +
// expiry, a mini price sparkline vs the trigger, and the GEX logic line. Verdict → tone follows
// the design: green → Enter (positive), yellow → Half size (warning), red → Skip (negative).
// No re-derivation — `verdict` is authored upstream; the spark path is real 15-min closes
// (useSignalCloses), the trigger is parsed from the host's own trigger/trade text, and both
// gracefully drop out when there's no price series or no plausible level to plot.
type Role = 'positive' | 'warning' | 'negative' | 'neutral';
const VERDICT: Record<string, { role: Role; label: string; tip?: string }> = {
  green:  { role: 'positive', label: 'All ✓ — Enter' },
  yellow: { role: 'warning',  label: 'Half size' },
  red:    { role: 'negative', label: 'Skip today' },
  // 'gray' = the IV/flow confirmation source (optioncharts.io) wasn't checked today, so this
  // setup carries no confirmed verdict — read the levels + logic and confirm it yourself.
  gray:   { role: 'neutral',  label: 'Unconfirmed', tip: 'IV/flow not checked today — no confirmed verdict' },
};

type Tk = 'spy' | 'qqq' | 'other';
function sigTicker(s: Signal): Tk {
  const t = `${s.trade} ${s.trigger}`.toUpperCase();
  if (t.includes('QQQ')) return 'qqq';
  if (t.includes('SPY') || t.includes('SPX')) return 'spy';
  return 'other';
}

type Side = 'calls' | 'puts' | 'other';
function sigSide(s: Signal): Side {
  const t = `${s.trade} ${s.trigger}`.toLowerCase();
  if (/\bput/.test(t)) return 'puts';
  if (/\bcall/.test(t)) return 'calls';
  return 'other';
}

// The nearest plausible price level named in the setup's trade/trigger text (within ±15% of
// where price actually is), used as the sparkline's dashed trigger line. Returns null when the
// trigger is free-form with no price (e.g. "hold the range through 11 AM").
function parseTrigger(s: Signal, ref: number): number | null {
  const nums = `${s.trade} ${s.trigger}`.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const plausible = nums.filter((n) => ref > 0 && Math.abs(n - ref) / ref <= 0.15);
  if (!plausible.length) return null;
  return plausible.reduce((best, n) => (Math.abs(n - ref) < Math.abs(best - ref) ? n : best));
}

const filterBtn = (on: boolean): React.CSSProperties => ({
  padding: '2px 10px', borderRadius: 4,
  border: `1px solid ${on ? 'var(--acc)' : 'var(--border)'}`,
  background: on ? 'var(--acc)' : 'transparent',
  color: on ? 'var(--text-inverse)' : 'var(--t2)',
  fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, fontFamily: 'inherit', cursor: 'pointer',
});

// The per-row mini price chart: dashed trigger line (verdict-colored) + the real 15-min close
// path + a dot on the latest print, with the live distance to the trigger beneath it.
function Spark({ series, trig, role }: { series: number[]; trig: number | null; role: Role }) {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const all = trig != null ? [...series, trig] : series;
  const max = Math.max(...all), min = Math.min(...all), span = (max - min) || 1;
  const y = (p: number) => 4 + ((max - p) / span) * 32;
  const points = series.map((p, i) => `${((i / (series.length - 1)) * 118).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const gap = trig != null ? trig - last : null;
  return (
    <span style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <svg width={120} height={40} viewBox="0 0 120 40" style={{ display: 'block' }}>
        {trig != null && (
          <line x1={0} y1={y(trig).toFixed(1)} x2={120} y2={y(trig).toFixed(1)} stroke={`var(--status-${role}-text)`} strokeWidth={1} strokeDasharray="3 3" />
        )}
        <polyline points={points} fill="none" stroke="var(--t2)" strokeWidth={1.5} strokeLinejoin="round" />
        <circle cx={118} cy={y(last).toFixed(1)} r={2.5} fill="var(--text)" />
      </svg>
      {gap != null && (
        <span style={{ fontSize: FONT_SIZE['3xs'], color: 'var(--t3)', whiteSpace: 'nowrap' }}>
          {Math.abs(gap).toFixed(1)} pts {gap > 0 ? 'below' : 'above'} trigger
        </span>
      )}
    </span>
  );
}

interface Props {
  signals: Signal[];
}

export function SignalsTable({ signals }: Props) {
  const [sym, setSym] = useState<'all' | 'spy' | 'qqq'>('all');
  const [side, setSide] = useState<'all' | 'calls' | 'puts'>('all');
  const closes = useSignalCloses();

  // SPY first, then QQQ, then anything else — matches the host's ordering.
  const order: Record<Tk, number> = { spy: 0, qqq: 1, other: 2 };
  const sorted = [...signals].sort((a, b) => order[sigTicker(a)] - order[sigTicker(b)]);
  const shown = sorted.filter((s) =>
    (sym === 'all' || sigTicker(s) === sym) && (side === 'all' || sigSide(s) === side));

  const ready = signals.filter((s) => s.verdict === 'green').length;
  const half = signals.filter((s) => s.verdict === 'yellow').length;
  const skip = signals.filter((s) => s.verdict === 'red').length;
  const unconfirmed = signals.filter((s) => s.verdict === 'gray').length;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>Today&apos;s setups</span>
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{ready} ready · {half} half size · {skip} skip{unconfirmed ? ` · ${unconfirmed} unconfirmed` : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
          {(['all', 'spy', 'qqq'] as const).map((f) => (
            <button key={f} style={filterBtn(sym === f)} onClick={() => setSym(f)}>
              {f === 'all' ? 'All' : f.toUpperCase()}
            </button>
          ))}
          <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
          {(['all', 'calls', 'puts'] as const).map((f) => (
            <button key={f} style={filterBtn(side === f)} onClick={() => setSide(f)}>
              {f === 'all' ? 'All' : f === 'calls' ? 'Calls' : 'Puts'}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', padding: '12px 16px' }}>No setups for this filter.</p>
      ) : (
        shown.map((s, i) => {
          const v = VERDICT[s.verdict] ?? { role: 'neutral' as Role, label: s.verdict };
          const tk = sigTicker(s);
          const series = tk === 'qqq' ? closes.QQQ : closes.SPY; // SPX plots on the SPY series (SPX÷10 scale)
          const ref = series.length ? series[series.length - 1] : 0;
          const trig = ref ? parseTrigger(s, ref) : null;
          return (
            <div
              key={i}
              style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 11,
                padding: '11px 16px',
                borderBottom: i === shown.length - 1 ? '1px solid transparent' : '1px solid var(--bsub)',
              }}
            >
              {/* verdict pill (fixed 108px) */}
              <span
                title={v.tip}
                style={{
                  width: 108, flexShrink: 0, textAlign: 'center',
                  fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase',
                  letterSpacing: '0.04em', padding: '3px 8px', borderRadius: 9999,
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

              {/* mini price sparkline vs trigger (real 15-min closes) */}
              <Spark series={tk === 'other' ? [] : series} trig={trig} role={v.role} />

              {/* logic (wraps below on mobile) */}
              <div style={{ flex: '1 1 230px', minWidth: 0, fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.45 }}>{s.logic}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
