import { useState } from 'react';
import { fmtDateTime, eventOverlayLabel, eventImportanceLabel, TREND_BUCKET_META, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { EventRiskRead, MacroEvent, EventImportance, TrendBucket } from '@stw/shared';

interface Props {
  read: EventRiskRead;
  /** Full window of scheduled events, soonest-first — rendered as the week-ahead list. */
  events: MacroEvent[];
  loading: boolean;
  error: string | null;
  warning?: string | null;
  /** Cross-market setup context — same inputs the other sleeves already compute. */
  qqqBucket: TrendBucket | null;
  vix: number | null;
  vixDelta5: number | null;
  us10yDelta5: number | null;
}

const RISK_COLOR: Record<EventRiskRead['riskLevel'], string> = {
  low: 'var(--t3)',
  medium: 'var(--c3)',
  high: 'var(--c1)',
  shock: 'var(--c1)',
};

const IMPORTANCE_COLOR: Record<EventImportance, string> = {
  very_high: 'var(--c1)',
  high: 'var(--c3)',
  medium: 'var(--t2)',
  low: 'var(--t3)',
};

function buildSetup(qqqBucket: TrendBucket | null, vix: number | null, vixDelta5: number | null, us10yDelta5: number | null): string {
  const parts: string[] = [];
  if (qqqBucket) parts.push(`QQQ ${TREND_BUCKET_META[qqqBucket].label.toLowerCase()}`);
  if (vix !== null) {
    const dir = vixDelta5 !== null ? (vixDelta5 > 0.5 ? ', rising' : vixDelta5 < -0.5 ? ', falling' : '') : '';
    parts.push(`VIX ${vix.toFixed(1)}${dir}`);
  }
  if (us10yDelta5 !== null) parts.push(`10Y ${us10yDelta5 > 0.03 ? 'rising' : us10yDelta5 < -0.03 ? 'falling' : 'flat'}`);
  return parts.length ? `${parts.join(', ')}.` : 'Setup context unavailable.';
}

// First-pass heuristics from the spec's interpretation table — still meant to
// be cross-checked against the setup above, never read in isolation.
function interpret(eventName: string, surprise: number | null, us10yDelta5: number | null, qqqBucket: TrendBucket | null): string {
  const isInflation = /\bcpi\b|\bpce\b|\bppi\b/i.test(eventName);
  const isJobs = /\bnonfarm payrolls\b|\bunemployment rate\b|\baverage hourly earnings\b|\bemployment situation\b/i.test(eventName);
  const isFed = /\bfomc\b|\bpowell\b/i.test(eventName);
  const yieldsRising = (us10yDelta5 ?? 0) > 0.03;
  const weakStructure = qqqBucket === 'bear_rally' || qqqBucket === 'risk_off' || qqqBucket === 'mid_caution';

  if (surprise === null) {
    if (isInflation) {
      return weakStructure && yieldsRising
        ? 'Market is vulnerable to a hot inflation print.'
        : 'A hot print would still pressure growth names if yields follow it higher.';
    }
    if (isJobs) return "A strong report that lifts rate-hike odds would weigh on growth/small-caps; a weak one is only bullish if it doesn't read as recessionary.";
    if (isFed) return 'A hawkish surprise pressures QQQ/IWM; a dovish one supports risk-on unless growth stress is already severe.';
    return 'Watch for a surprise large enough to move yields and volatility.';
  }

  const hot = surprise > 0;
  if (isInflation) {
    if (hot) return yieldsRising ? 'Negative for growth stocks unless yields reverse lower.' : 'Hotter print, but yields have not followed yet — watch for a delayed reaction.';
    return !yieldsRising ? 'Cooler print supports risk assets, especially if yields keep easing.' : 'Cooler print, but yields are still rising — a mixed signal.';
  }
  if (isJobs) {
    return hot
      ? 'Stronger labor data raises rate-hike odds — a headwind for growth/small-caps unless offset by cooling wages.'
      : 'Softer labor data is bullish only if it does not read as the start of a recessionary trend.';
  }
  if (isFed) return hot ? 'Hawkish lean — pressure on QQQ/IWM likely.' : 'Dovish lean — supportive for risk-on unless growth stress is severe.';
  return hot
    ? 'Came in above consensus — watch the cross-market reaction (yields, VIX) to confirm direction.'
    : 'Came in below consensus — watch the cross-market reaction (yields, VIX) to confirm direction.';
}

/** One release, rendered on a single line: name · date · (actual once released) · previous.
 *  Consensus is not shown — the FRED calendar doesn't publish it, so it was always "—". */
function EventRow({ e, highlight }: { e: MacroEvent; highlight: boolean }) {
  const released = new Date(e.releaseTimeEt).getTime() <= Date.now();
  return (
    <div
      style={{
        display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
        padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: FONT_SIZE.sm,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: IMPORTANCE_COLOR[e.importance], flexShrink: 0, alignSelf: 'center' }} />
      <span style={{ fontWeight: highlight ? FONT_WEIGHT.semibold : FONT_WEIGHT.medium, color: 'var(--text)' }}>
        {e.eventName}{e.period ? ` (${e.period})` : ''}
      </span>
      <span style={{ color: 'var(--t2)' }}>{fmtDateTime(e.releaseTimeEt)}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap', color: 'var(--t3)' }}>
        {released && e.actual && <span style={{ color: 'var(--text)', fontWeight: FONT_WEIGHT.medium }}>Actual: {e.actual}</span>}
        {e.previous && <span>Previous: {e.previous}</span>}
      </span>
    </div>
  );
}

export function MacroEventRiskCard({ read, events, loading, error, warning, qqqBucket, vix, vixDelta5, us10yDelta5 }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (loading && !read.event) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading event calendar…</div>;
  if (error) return <div style={{ color: 'var(--c1)', fontSize: FONT_SIZE.sm }}>Event data unavailable: {error}</div>;

  const { overlay, riskLevel, event, surprise } = read;

  // The "Scheduled releases" list is UPCOMING-only — a release whose time has passed
  // drops off (it's already surfaced by the Reaction Overlay headline above with its
  // actual print). Default view = the next 7 days; the rest hides behind "Show more".
  const nowMs = Date.now();
  const cutoff = nowMs + 7 * 86_400_000;
  const upcoming = events.filter((e) => new Date(e.releaseTimeEt).getTime() >= nowMs);
  const within7 = upcoming.filter((e) => new Date(e.releaseTimeEt).getTime() <= cutoff);
  const laterCount = upcoming.length - within7.length;
  const shown = expanded ? upcoming : within7;
  const setup = buildSetup(qqqBucket, vix, vixDelta5, us10yDelta5);
  const interpretation = event ? interpret(event.eventName, surprise, us10yDelta5, qqqBucket) : null;
  const isPreRelease = overlay === 'event_watch' || overlay === 'high_event_risk';

  return (
    <div>
      {/* Overlay status — the classification for the nearest major event. */}
      {overlay === 'none' ? (
        <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t2)' }}>
          {eventOverlayLabel('none')}
          <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', marginLeft: 8 }}>
            {event ? `next: ${event.eventName}, outside the 48h window` : 'nothing major in the next 48 hours'}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: RISK_COLOR[riskLevel] }}>{eventOverlayLabel(overlay)}</span>
          {event && <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>{event.eventName} — {fmtDateTime(event.releaseTimeEt)}</span>}
          <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{event ? `${eventImportanceLabel(event.importance)} impact` : ''}</span>
        </div>
      )}

      {/* Post-release line — leads with the ACTUAL print as soon as the release time
          passes. The FRED calendar carries no consensus, so we compare against the
          previous print (surprise vs consensus shows only on the rare row that has one). */}
      {!isPreRelease && overlay !== 'none' && event && event.actual && (
        <div style={{ marginTop: 6, fontSize: FONT_SIZE.sm, color: surprise != null ? (surprise > 0 ? 'var(--c1)' : surprise < 0 ? 'var(--c5)' : 'var(--t2)') : 'var(--t2)' }}>
          Actual {event.actual}
          {event.previous ? ` vs prev ${event.previous}` : ''}
          {surprise != null ? ` · Surprise ${surprise >= 0 ? '+' : ''}${surprise.toFixed(2)}` : ''}
        </div>
      )}

      {/* Setup + interpretation for the nearest event. */}
      {event && (
        <div style={{ marginTop: 10, fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5 }}>
          <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Setup:</span> {setup}</div>
          {interpretation && <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Interpretation:</span> {interpretation}</div>}
        </div>
      )}

      {/* Week-ahead list — next 7 days by default, "Show more" reveals the rest. */}
      {events.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 2 }}>
            Scheduled releases{expanded ? '' : ' · next 7 days'}
          </div>
          {shown.length === 0 && (
            <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', padding: '7px 0', borderTop: '1px solid var(--border)' }}>
              Nothing scheduled in the next 7 days.
            </div>
          )}
          {shown.map((e, i) => (
            <EventRow key={`${e.eventName}-${e.releaseTimeEt}`} e={e} highlight={event ? e.releaseTimeEt === event.releaseTimeEt && e.eventName === event.eventName : i === 0} />
          ))}
          {laterCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: FONT_SIZE.sm, color: 'var(--t2)', textDecoration: 'underline',
              }}
            >
              {expanded ? 'Show less' : `Show more (${laterCount})`}
            </button>
          )}
        </div>
      )}

      {warning && <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 8 }}>{warning}</div>}
      <EventSourceNote />
    </div>
  );
}

function EventSourceNote() {
  return (
    <div style={{ marginTop: 8, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
      Source: <a href="https://fred.stlouisfed.org/releases" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t3)', textDecoration: 'underline' }}>FRED release calendar</a> + FOMC schedule
    </div>
  );
}
