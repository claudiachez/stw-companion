import { useState } from 'react';
import { FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { GexChart, type Timeframe } from './GexChart';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useCapabilities } from '../../../context/AppCapabilities';
import type { LevelSet } from '../api';

// Only intraday TFs the data source actually returns — 1h/4h/1d/1W were dropped
// because TwelveData's free tier returns no bars for them.
const TFS: Timeframe[] = ['5m', '15m', '30m'];

const tfBtn = (on: boolean): React.CSSProperties => ({
  padding: '2px 7px', borderRadius: 4,
  border: `1px solid ${on ? 'var(--acc)' : 'var(--border)'}`,
  background: on ? 'var(--c5bg)' : 'transparent',
  color: on ? 'var(--acc)' : 'var(--t2)',
  fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, fontFamily: 'inherit', cursor: 'pointer',
});

interface Props {
  spyLevels: LevelSet | null;  // SPX ÷ 10
  qqqLevels: LevelSet | null;
}

export function GexCharts({ spyLevels, qqqLevels }: Props) {
  const { finnhubKey, twelveDataKey } = useCapabilities();
  const [tf, setTf] = useState<Timeframe>('30m');
  const isMobile = useIsMobile();

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)', flexShrink: 0 }}>
      <div style={{ padding: '14px 13px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>Live chart · SPY &amp; QQQ</span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {TFS.map((t) => (
            <button key={t} style={tfBtn(tf === t)} onClick={() => setTf(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: isMobile ? 400 : 300 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', position: 'relative', borderRight: isMobile ? 'none' : '1px solid var(--border)', borderBottom: isMobile ? '6px solid var(--border)' : 'none' }}>
          <ChartLabel text="SPY" />
          <GexChart symbol="SPY" levels={spyLevels} timeframe={tf} finnhubKey={finnhubKey} twelveDataKey={twelveDataKey} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', position: 'relative' }}>
          <ChartLabel text="QQQ" />
          <GexChart symbol="QQQ" levels={qqqLevels} timeframe={tf} finnhubKey={finnhubKey} twelveDataKey={twelveDataKey} />
        </div>
      </div>
    </div>
  );
}

function ChartLabel({ text }: { text: string }) {
  return (
    <span style={{
      position: 'absolute', top: 6, left: 8, zIndex: 10,
      fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: 'var(--t2)',
      background: 'var(--bg)', padding: '1px 5px', borderRadius: 3, pointerEvents: 'none',
    }}>
      {text}
    </span>
  );
}
