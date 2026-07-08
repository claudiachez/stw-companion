import { fmtDateTime, eventOverlayLabel, eventImportanceLabel, TREND_BUCKET_META, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { EventRiskRead, TrendBucket } from '@stw/shared';

interface Props {
  read: EventRiskRead;
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
  const isJobs = /\bnonfarm payrolls\b|\bunemployment rate\b|\baverage hourly earnings\b/i.test(eventName);
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

export function MacroEventRiskCard({ read, loading, error, warning, qqqBucket, vix, vixDelta5, us10yDelta5 }: Props) {
  if (loading && !read.event) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading event calendar…</div>;
  if (error) return <div style={{ color: 'var(--c1)', fontSize: FONT_SIZE.sm }}>Event data unavailable: {error}</div>;

  const { overlay, riskLevel, event, surprise } = read;

  if (overlay === 'none') {
    return (
      <div>
        <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t2)' }}>{eventOverlayLabel('none')}</div>
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', marginTop: 4 }}>
          {event
            ? <>Next tracked event: {event.eventName} — {fmtDateTime(event.releaseTimeEt)}, outside the 48h risk window.</>
            : 'Nothing major scheduled in the next 48 hours.'}
        </div>
        {warning && <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 8 }}>{warning}</div>}
        <EventSourceNote />
      </div>
    );
  }

  if (!event) return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>No event data available.</div>;

  const isPreRelease = overlay === 'event_watch' || overlay === 'high_event_risk';
  const setup = buildSetup(qqqBucket, vix, vixDelta5, us10yDelta5);
  const interpretation = interpret(event.eventName, surprise, us10yDelta5, qqqBucket);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: RISK_COLOR[riskLevel] }}>{eventOverlayLabel(overlay)}</span>
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{eventImportanceLabel(event.importance)} impact</span>
      </div>

      <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>
        {event.eventName}{event.period ? ` (${event.period})` : ''}
      </div>
      <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', marginTop: 2 }}>
        {fmtDateTime(event.releaseTimeEt)}
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontSize: FONT_SIZE.sm }}>
        {isPreRelease ? (
          <>
            <div><span style={{ color: 'var(--t3)' }}>Consensus:</span> {event.consensus ?? '—'}</div>
            <div><span style={{ color: 'var(--t3)' }}>Previous:</span> {event.previous ?? '—'}</div>
          </>
        ) : (
          <>
            <div><span style={{ color: 'var(--t3)' }}>Actual:</span> {event.actual ?? '—'}</div>
            <div><span style={{ color: 'var(--t3)' }}>Consensus:</span> {event.consensus ?? '—'}</div>
            <div><span style={{ color: 'var(--t3)' }}>Previous:</span> {event.previous ?? '—'}</div>
            {surprise !== null && (
              <div style={{ color: surprise > 0 ? 'var(--c1)' : surprise < 0 ? 'var(--c5)' : 'var(--t2)' }}>
                Surprise: {surprise >= 0 ? '+' : ''}{surprise.toFixed(2)}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5 }}>
        <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Setup:</span> {setup}</div>
        <div><span style={{ color: 'var(--t3)', fontWeight: FONT_WEIGHT.semibold }}>Interpretation:</span> {interpretation}</div>
      </div>

      {warning && <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 8 }}>{warning}</div>}
      <EventSourceNote />
    </div>
  );
}

function EventSourceNote() {
  return (
    <div style={{ marginTop: 8, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
      Source: FRED release calendar + FOMC schedule
    </div>
  );
}
