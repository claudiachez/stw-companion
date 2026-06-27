import type { SentimentScore } from '@stw/shared';

interface Props {
  score: SentimentScore | null;
  loading: boolean;
}

function scoreZone(s: number): { label: string; color: string } {
  if (s < 25)  return { label: 'Extreme Fear',  color: '#ef4444' };
  if (s < 45)  return { label: 'Fear',          color: '#f97316' };
  if (s < 55)  return { label: 'Neutral',       color: '#9ca3af' };
  if (s < 75)  return { label: 'Greed',         color: '#14b8a6' };
  return             { label: 'Extreme Greed',  color: '#22c55e' };
}

// Arc gauge: draws a semicircle (180°) from 0 to 100
function ArcGauge({ value }: { value: number | null }) {
  const cx = 120, cy = 110, r = 90;
  const startAngle = Math.PI; // left
  const endAngle = 0;         // right

  function polarToXY(angle: number): [number, number] {
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  // Background arc
  const bgStart = polarToXY(startAngle);
  const bgEnd = polarToXY(endAngle);
  const bgPath = `M ${bgStart[0]} ${bgStart[1]} A ${r} ${r} 0 0 1 ${bgEnd[0]} ${bgEnd[1]}`;

  // Value arc (if value)
  let valuePath = '';
  let needleX = cx, needleY = cy - r;
  if (value !== null) {
    const clipped = Math.max(0, Math.min(100, value));
    // angle goes from π (0) to 0 (100) linearly
    const angle = startAngle - (clipped / 100) * Math.PI;
    const [vx, vy] = polarToXY(angle);
    const large = clipped > 50 ? 1 : 0;
    valuePath = `M ${bgStart[0]} ${bgStart[1]} A ${r} ${r} 0 ${large} 1 ${vx} ${vy}`;
    needleX = vx;
    needleY = vy;
  }

  const zone = value !== null ? scoreZone(value) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg viewBox="0 0 240 130" style={{ width: '100%', maxWidth: 280 }}>
        {/* Zone segments (color bands) */}
        {[
          { from: 0, to: 25,  color: '#ef4444' },
          { from: 25, to: 45, color: '#f97316' },
          { from: 45, to: 55, color: '#9ca3af' },
          { from: 55, to: 75, color: '#14b8a6' },
          { from: 75, to: 100,color: '#22c55e' },
        ].map(({ from, to, color }) => {
          const a1 = startAngle - (from / 100) * Math.PI;
          const a2 = startAngle - (to / 100) * Math.PI;
          const [x1, y1] = polarToXY(a1);
          const [x2, y2] = polarToXY(a2);
          return (
            <path key={from} d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
              fill="none" stroke={color} strokeWidth={12} strokeLinecap="butt" opacity={0.3} />
          );
        })}

        {/* Background arc */}
        <path d={bgPath} fill="none" stroke="var(--border)" strokeWidth={8} />

        {/* Value arc */}
        {valuePath && value !== null && (
          <path d={valuePath} fill="none" stroke={zone!.color} strokeWidth={8} strokeLinecap="round" />
        )}

        {/* Needle */}
        {value !== null && (
          <>
            <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="var(--text)" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={5} fill="var(--text)" />
          </>
        )}

        {/* Zone labels */}
        <text x={30} y={125} fontSize={8} fill="#ef4444" textAnchor="middle">Extreme Fear</text>
        <text x={84} y={80} fontSize={8} fill="#f97316" textAnchor="middle">Fear</text>
        <text x={120} y={65} fontSize={8} fill="#9ca3af" textAnchor="middle">Neutral</text>
        <text x={156} y={80} fontSize={8} fill="#14b8a6" textAnchor="middle">Greed</text>
        <text x={210} y={125} fontSize={8} fill="#22c55e" textAnchor="middle">Extreme Greed</text>

        {/* Score in center */}
        {value !== null && (
          <>
            <text x={cx} y={cy + 20} fontSize={22} fontWeight={700} fill={zone!.color} textAnchor="middle">{Math.round(value)}</text>
            <text x={cx} y={cy + 35} fontSize={9} fill={zone!.color} textAnchor="middle">{zone!.label}</text>
          </>
        )}
      </svg>
    </div>
  );
}

function MiniBar({ score }: { score: number | null }) {
  if (score === null) return <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3 }} />;
  const zone = scoreZone(score);
  return (
    <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${score}%`, height: '100%', background: zone.color, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  );
}

export function SentimentGauge({ score, loading }: Props) {
  return (
    <div>
      {loading && !score && (
        <div style={{ color: 'var(--t3)', fontSize: 12, padding: '16px 0' }}>Computing sentiment…</div>
      )}

      {score && (
        <>
          <ArcGauge value={score.total} />

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {score.inputs.map((inp) => (
              <div key={inp.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 140, fontSize: 12, color: 'var(--t2)' }}>{inp.label}</div>
                <MiniBar score={inp.score} />
                <div style={{ minWidth: 28, fontSize: 12, color: inp.score !== null ? scoreZone(inp.score).color : 'var(--t3)', textAlign: 'right' }}>
                  {inp.score !== null ? Math.round(inp.score) : '—'}
                </div>
                <div style={{ minWidth: 32, fontSize: 10, color: 'var(--t3)', textAlign: 'right' }}>
                  {Math.round(inp.weight * 100)}%
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
