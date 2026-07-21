import { useGraddox, useLastMorningRun } from './useGraddox';
import { useLiveSignalQuotes } from './useLiveSignalQuotes';
import { LevelCard } from './components/LevelCard';
import { SignalsTable } from './components/SignalsTable';
import { BiasChip } from './components/BiasChip';
import { GexCharts } from './components/GexCharts';
import { DayLog } from './components/DayLog';
import { Glossary } from './components/Glossary';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { EmptyState } from '../../primitives/EmptyState';
import { AlertStrip } from '../../primitives/AlertStrip';
import { fmtDateTime, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { LevelSet } from './api';

const ET = { timeZone: 'America/New_York' } as const;
const CHART_ANCHOR = 'stw-gex-live-chart';

const scale10 = (v: number | null | undefined) => (v != null ? +(v / 10).toFixed(2) : null);

// ── Signals content (shared by web + admin) ───────────────────
// A single 900px column of stacked cards (gap 12). RE-LAYOUT of the existing GEX read —
// all data (bias, per-symbol level sets, signals, day-log, freshness) comes from useGraddox
// + the shared scorers; no new data logic. Advisory / display-only. Paywall/tier gating lives
// in each app shell, not here.
export function SignalsView() {
  const { data: gx, isLoading, error } = useGraddox();
  const { data: lastMorningRun } = useLastMorningRun();
  const liveQuotes = useLiveSignalQuotes();
  const isMobile = useIsMobile();

  if (isLoading) return <LoadingSpinner className="mt-16" />;
  if (error) return <EmptyState message="Failed to load GEX signals." />;
  if (!gx) return <EmptyState message="No GEX read published yet." />;

  const dateStr = gx.date
    ? new Date(gx.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const upd = gx.last_updated ? new Date(gx.last_updated) : null;
  const updStr = upd ? fmtDateTime(upd) : '–';
  const priceTime = upd ? '@ ' + upd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...ET }) : '';

  // Stale = the latest read predates today (ET) — no fresh GEX report for the current session
  // (e.g. the host on break). We still show the last read below; the banner makes that clear.
  const todayET = new Date().toLocaleDateString('en-CA', ET);
  const isStale = !!gx.date && gx.date < todayET;
  const shortDate = gx.date
    ? new Date(gx.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
    : '';

  // SPY levels = SPX ÷ 10 (both the chart + ladder show SPY scale).
  const spyLevels: LevelSet = {
    resistance: scale10(gx.spx.resistance),
    gex1: scale10(gx.spx.gex1),
    put_support: scale10(gx.spx.put_support),
    key_target: scale10(gx.spx.key_target),
    downside_risk: scale10(gx.spx.downside_risk),
  };
  // "now" prefers the LIVE Finnhub quote (same source as the Macro GEX spot — one value across
  // the platform), falling back to the GEX read's captured spot when no live quote is available.
  const spyPrice = liveQuotes.spy ?? scale10(gx.spx_price);
  const qqqPrice = liveQuotes.qqq ?? gx.qqq_price;
  const liveTimeTag = liveQuotes.at
    ? '@ ' + new Date(liveQuotes.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...ET }) + ' live'
    : null;
  const spyPriceTime = liveQuotes.spy != null ? (liveTimeTag ?? priceTime) : priceTime;
  const qqqPriceTime = liveQuotes.qqq != null ? (liveTimeTag ?? priceTime) : priceTime;

  const ready = gx.signals.filter((s) => s.verdict === 'green').length;
  const half = gx.signals.filter((s) => s.verdict === 'yellow').length;
  const skip = gx.signals.filter((s) => s.verdict === 'red').length;
  const headline = gx.signals.length
    ? `${ready} ready · ${half} half size · ${skip} skip`
    : 'No setups published today.';

  const openChart = () => {
    document.getElementById(CHART_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)',
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? 12 : '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 0. Stale banner — only when there's no fresh report today. */}
        {isStale && (
          <AlertStrip severity="warning">
            <span style={{ fontWeight: FONT_WEIGHT.bold }}>No new GEX report today.</span>{' '}
            Showing the last read from {shortDate}.
            {gx.status_note ? ` ${gx.status_note}` : ''}
          </AlertStrip>
        )}

        {/* 1. Session verdict banner. */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <BiasChip bias={gx.bias} />
            <span style={{ fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>{headline}</span>
            <span style={{ marginLeft: isMobile ? 0 : 'auto', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', whiteSpace: 'nowrap', width: isMobile ? '100%' : undefined }}>
              GEX read · {dateStr} · as of {updStr}
              {isStale && lastMorningRun ? <> · checked {fmtDateTime(lastMorningRun)}</> : null}
            </span>
          </div>
          <div style={{ padding: '8px 14px 12px' }}>
            {gx.bias_note && (
              <p style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5, margin: 0 }}>{gx.bias_note}</p>
            )}
            <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.5, margin: '6px 0 0' }}>
              Advisory only — these are the GEX read&apos;s levels and setups, not orders.
            </p>
          </div>
        </div>

        {/* 2. Price maps. */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <div style={{ padding: 16 }}>
            <div style={{ ...sectionTitle, marginBottom: 4 }}>Where price sits vs today&apos;s levels</div>
            <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.5, margin: '0 0 12px' }}>
              Above the gamma-flat line, dealers dampen moves (calmer). Below it, they chase moves (faster, both ways). Below put support, the floor is gone.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <LevelCard symbol="SPY" levels={spyLevels} currentPrice={spyPrice} priceTime={spyPriceTime} onOpenChart={openChart} />
              <LevelCard symbol="QQQ" levels={gx.qqq} currentPrice={qqqPrice} priceTime={qqqPriceTime} onOpenChart={openChart} />
            </div>
          </div>
        </div>

        {/* Live chart (existing GexChart, untouched) — the price-maps' "Open the live chart ↗" target. */}
        <div id={CHART_ANCHOR} style={{ scrollMarginTop: 12 }}>
          <GexCharts spyLevels={spyLevels} qqqLevels={gx.qqq} />
        </div>

        {/* 3. Today's setups. */}
        {gx.signals.length > 0 && <SignalsTable signals={gx.signals} />}

        {/* 4. Day log. */}
        {gx.log.length > 0 && <DayLog log={gx.log} date={gx.date} />}

        {/* 5. Glossary. */}
        <Glossary />
      </div>
    </div>
  );
}
