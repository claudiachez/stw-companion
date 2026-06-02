import { useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode,
  type IChartApi, type ISeriesApi, type CandlestickData, type UTCTimestamp,
} from 'lightweight-charts';
import { useThemeStore } from '../../../store/theme';
import type { LevelSet } from '../api';

export type Timeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1W';

interface TfCfg { interval: string; outputsize: number; visible: number }
const TF: Record<Timeframe, TfCfg> = {
  '5m':  { interval: '5min',  outputsize: 390, visible: 80  },
  '15m': { interval: '15min', outputsize: 300, visible: 80  },
  '30m': { interval: '30min', outputsize: 200, visible: 70  },
  '1h':  { interval: '1h',    outputsize: 200, visible: 50  },
  '4h':  { interval: '4h',    outputsize: 200, visible: 40  },
  '1d':  { interval: '1day',  outputsize: 500, visible: 120 },
  '1W':  { interval: '1week', outputsize: 260, visible: 104 },
};

// EMA periods + colors (5 / 9 / 21 / 50), and the GEX level lines.
const EMAS: [number, string][] = [[5, '#22C55E'], [9, '#06B6D4'], [21, '#F97316'], [50, '#EF4444']];
const LEVEL_LINES: [keyof LevelSet, string, string, number][] = [
  ['resistance',    '#EF4444', 'Resistance',    1],
  ['gex1',          '#D97706', 'GEX1',          1],
  ['put_support',   '#22C55E', 'Put Support',   1],
  ['key_target',    '#6366F1', 'Target',        2],
  ['downside_risk', '#F97316', 'Downside Risk', 2],
];

type Bar = CandlestickData<UTCTimestamp>;

// Resolve theme-aware chrome colors from the live CSS variables (data-theme lives
// on <html>), so charts match the surrounding card in both dark and light themes.
function chartColors() {
  const css = getComputedStyle(document.documentElement);
  const cv = (name: string, fb: string) => css.getPropertyValue(name).trim() || fb;
  return {
    bg: cv('--surface', '#111111'),
    text: cv('--t2', '#a0a0a0'),
    border: cv('--border', '#2a2a2a'),
  };
}

function chromeOptions() {
  const c = chartColors();
  return {
    layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text },
    grid: { vertLines: { color: c.border }, horzLines: { color: c.border } },
    rightPriceScale: { borderColor: c.border },
    timeScale: { borderColor: c.border },
  };
}

function calcEMA(bars: Bar[], period: number) {
  if (bars.length < 2) return [];
  const k = 2 / (period + 1);
  let ema = bars[0].close;
  return bars.map((b) => {
    ema = b.close * k + ema * (1 - k);
    return { time: b.time, value: +ema.toFixed(4) };
  });
}

interface Props {
  symbol: 'SPY' | 'QQQ';
  levels: LevelSet | null;   // already scaled for display
  timeframe: Timeframe;
  finnhubKey?: string;
  twelveDataKey?: string;
}

export function GexChart({ symbol, levels, timeframe, finnhubKey, twelveDataKey }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';

    if (!twelveDataKey) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9CA3AF;font-size:12px">Chart key not configured</div>';
      return;
    }

    let chart: IChartApi | null = null;
    let candles: ISeriesApi<'Candlestick'> | null = null;
    let liveTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let lastBar: Bar | null = null;

    const loading = document.createElement('div');
    loading.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#9CA3AF;font-size:12px';
    loading.textContent = 'Loading…';
    el.appendChild(loading);

    const cfg = TF[timeframe] ?? TF['30m'];

    async function fetchBars(): Promise<Bar[]> {
      const url = `https://api.twelvedata.com/time_series?symbol=${symbol}`
        + `&interval=${cfg.interval}&outputsize=${cfg.outputsize}&timezone=UTC&apikey=${twelveDataKey}`;
      try {
        const data = await (await fetch(url)).json();
        if (data.status !== 'ok' || !data.values?.length) return [];
        return [...data.values].reverse().map((v: Record<string, string>) => ({
          time: Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000) as UTCTimestamp,
          open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close),
        }));
      } catch { return []; }
    }

    (async () => {
      const bars = await fetchBars();
      if (cancelled || !ref.current) return;
      el.innerHTML = '';

      if (!bars.length) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9CA3AF;font-size:12px">No data</div>';
        return;
      }

      const showTime = timeframe !== '1d' && timeframe !== '1W';
      const chrome = chromeOptions();
      chart = createChart(el, {
        autoSize: true,
        ...chrome,
        timeScale: { ...chrome.timeScale, timeVisible: showTime, secondsVisible: false },
        crosshair: { mode: CrosshairMode.Normal },
      });
      chartRef.current = chart;

      candles = chart.addCandlestickSeries({
        upColor: '#22C55E', downColor: '#EF4444',
        borderUpColor: '#16A34A', borderDownColor: '#DC2626',
        wickUpColor: '#16A34A', wickDownColor: '#DC2626',
      });
      candles.setData(bars);

      EMAS.forEach(([period, color]) => {
        const emaData = calcEMA(bars, period);
        if (!emaData.length) return;
        chart!.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(emaData);
      });

      if (levels) {
        LEVEL_LINES.forEach(([key, color, title, style]) => {
          const price = levels[key];
          if (price == null) return;
          candles!.createPriceLine({ price: price as number, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
        });
      }

      const total = bars.length;
      if (total > cfg.visible) {
        chart.timeScale().setVisibleLogicalRange({ from: total - cfg.visible - 0.5, to: total + 0.5 });
      } else {
        chart.timeScale().fitContent();
      }

      lastBar = bars[bars.length - 1];

      // Live price via Finnhub — updates the current candle every 30s (intraday only).
      if (finnhubKey && ['5m', '15m', '30m', '1h', '4h'].includes(timeframe)) {
        const updateLive = async () => {
          try {
            const q = await (await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubKey}`)).json();
            if (cancelled || !candles || !lastBar || !q.c) return;
            candles.update({
              time: lastBar.time,
              open: lastBar.open,
              high: Math.max(lastBar.high, q.c),
              low: Math.min(lastBar.low, q.c),
              close: q.c,
            });
          } catch { /* ignore */ }
        };
        updateLive();
        liveTimer = setInterval(updateLive, 30000);
      }
    })();

    return () => {
      cancelled = true;
      if (liveTimer) clearInterval(liveTimer);
      if (chart) { try { chart.remove(); } catch { /* already gone */ } }
      chartRef.current = null;
    };
  }, [symbol, timeframe, finnhubKey, twelveDataKey, JSON.stringify(levels)]);

  // Re-skin (no re-fetch) when the theme toggles.
  useEffect(() => {
    if (chartRef.current) chartRef.current.applyOptions(chromeOptions());
  }, [theme]);

  return <div ref={ref} style={{ flex: 1, height: '100%', minWidth: 0 }} />;
}
