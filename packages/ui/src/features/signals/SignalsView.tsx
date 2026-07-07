import { useGraddox, useLastMorningRun } from './useGraddox';
import { LevelCard } from './components/LevelCard';
import { SignalsTable } from './components/SignalsTable';
import { BiasChip } from './components/BiasChip';
import { GexCharts } from './components/GexCharts';
import { DayLog } from './components/DayLog';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { EmptyState } from '../../primitives/EmptyState';
import { fmtDateTime, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { LevelSet } from './api';

const ET = { timeZone: 'America/New_York' } as const;

const scale10 = (v: number | null | undefined) => (v != null ? +(v / 10).toFixed(2) : null);

// ── Signals content (shared by web + admin) ───────────────────
// Paywall/tier gating lives in each app shell, not here.
export function SignalsView() {
  const { data: gx, isLoading, error } = useGraddox();
  const { data: lastMorningRun } = useLastMorningRun();
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

  // Stale = the latest read is from a day before today (ET) — i.e. there's no fresh GEX report for
  // the current session (e.g. host on break). We still show the last read's levels below, but the
  // subheader makes clear it's the last read, not today's, and surfaces any resume note.
  const todayET = new Date().toLocaleDateString('en-CA', ET); // YYYY-MM-DD in ET
  const isStale = !!gx.date && gx.date < todayET;
  const shortDate = gx.date
    ? new Date(gx.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
    : '';

  // SPY levels = SPX ÷ 10 (the chart + ladder both show SPY scale).
  const spyLevels: LevelSet = {
    resistance: scale10(gx.spx.resistance),
    gex1: scale10(gx.spx.gex1),
    put_support: scale10(gx.spx.put_support),
    key_target: scale10(gx.spx.key_target),
    downside_risk: scale10(gx.spx.downside_risk),
  };
  const spyPrice = scale10(gx.spx_price);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Subheader: date + bias + note + updated. When stale, lead with "No new report" and frame
          the read as the last one, plus any resume note (status_note). */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', padding: '9px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {isStale ? (
          <>
            <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: 'var(--c3)' }}>No new report</span>
            <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>Last GEX read:</span>
            <BiasChip bias={gx.bias} />
            <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>{shortDate}</span>
            {gx.status_note && <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)' }}>· {gx.status_note}</span>}
          </>
        ) : (
          <>
            <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>{dateStr}</span>
            <BiasChip bias={gx.bias} />
            {gx.bias_note && <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)' }}>{gx.bias_note}</span>}
          </>
        )}
        {isStale ? (
          <span style={{ marginLeft: isMobile ? 0 : 'auto', fontSize: FONT_SIZE.xs, color: 'var(--t3)', whiteSpace: 'nowrap', width: isMobile ? '100%' : undefined }}>
            {lastMorningRun
              ? <>Checked: <span style={{ color: 'var(--t2)' }}>{fmtDateTime(lastMorningRun)}</span> · Last report: {updStr}</>
              : `Last report: ${updStr}`}
          </span>
        ) : (
          <span style={{ marginLeft: isMobile ? 0 : 'auto', fontSize: FONT_SIZE.xs, color: 'var(--t3)', whiteSpace: 'nowrap', width: isMobile ? '100%' : undefined }}>
            Updated: {updStr}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flex: 1, overflow: isMobile ? 'auto' : 'hidden' }}>
        {/* Left: level ladders */}
        <div style={{ flex: isMobile ? 'none' : '0 0 300px', width: isMobile ? '100%' : undefined, overflowY: isMobile ? 'visible' : 'auto', padding: isMobile ? 10 : 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <LevelCard title="📊 SPY Levels" levels={spyLevels} currentPrice={spyPrice} priceTime={priceTime} />
          <LevelCard title="📊 QQQ Levels" levels={gx.qqq} currentPrice={gx.qqq_price} priceTime={priceTime} isQQQ />
        </div>

        {/* Right: charts + signals + log */}
        <div style={{ flex: 1, overflowY: isMobile ? 'visible' : 'auto', padding: isMobile ? 10 : 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <GexCharts spyLevels={spyLevels} qqqLevels={gx.qqq} />
          {gx.signals.length > 0 && <SignalsTable signals={gx.signals} />}
          {gx.log.length > 0 && <DayLog log={gx.log} date={gx.date} />}
        </div>
      </div>
    </div>
  );
}
