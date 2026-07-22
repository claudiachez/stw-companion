import { useState } from 'react';
import { fmtDateTime, formatDate, eventPrintTrend, earningsHourLabel, fmtEpsEstimate, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { MacroEvent, EarningsEvent, EventImportance, EventPrintTrend } from '@stw/shared';
import { Card, CardHeader, HelpPanel } from './macroVisuals';

interface Props {
  events: MacroEvent[];
  earnings: EarningsEvent[];
  /** Tickers the signed-in user holds (own IBKR book) — highest priority holder dot. */
  ownTickers: string[];
  /** Tickers STW holds. */
  stwTickers: string[];
  loading: boolean;
  error: string | null;
  /** Earnings-feed error (separate from the macro-prints `error`), so a silently-empty
   *  earnings calendar surfaces a reason instead of reading as "nothing scheduled". */
  earningsError?: string | null;
  warning?: string | null;
  helpOpen: boolean;
  onToggleHelp: () => void;
  help: React.ReactNode;
  updatedAt?: Date | string | null;
}

type Risk = 'High' | 'Med' | 'Low';

const RISK_STYLE: Record<Risk, { bg: string; border: string; text: string }> = {
  High: { bg: 'var(--status-negative-bg)', border: 'var(--status-negative-border)', text: 'var(--status-negative-text)' },
  Med:  { bg: 'var(--status-warning-bg)',  border: 'var(--status-warning-border)',  text: 'var(--status-warning-text)' },
  Low:  { bg: 'var(--s2)',                 border: 'var(--border)',                 text: 'var(--t3)' },
};

const FAVOR_COLOR: Record<EventPrintTrend['favorable'], string> = {
  good: 'var(--status-positive-text)',
  bad: 'var(--status-negative-text)',
  neutral: 'var(--t3)',
};

interface Row {
  key: string;
  whenMs: number;
  when: string;
  holder: string;      // dot color
  holderTip: string;
  what: string;
  actual?: string;     // released print, e.g. "3.2%"
  actualColor?: string;
  insight?: string;
  risk: Risk;
}

function importanceToRisk(i: EventImportance): Risk {
  return i === 'very_high' || i === 'high' ? 'High' : i === 'medium' ? 'Med' : 'Low';
}

function printGlyph(t: EventPrintTrend): string {
  return t.dir === 'up' ? '▲' : t.dir === 'down' ? '▼' : '▬';
}

// "Coming up" — one chronological 7-day feed merging scheduled macro prints with
// upcoming earnings for names you hold / STW holds / market movers. Both streams
// arrive already computed (useMacroEvents + useEarningsCalendar); this only merges,
// sorts and lays them out. A macro print that already released earlier today shows
// its actual-vs-previous read (via the shared eventPrintTrend scorer).
// The default horizon; "Show more" extends it to cover the full fetched calendar
// (earnings are fetched ~45 days out; monitored macro prints ride alongside).
const NEAR_DAYS = 7;
const FAR_DAYS = 45;

export function ComingUpCard({ events, earnings, ownTickers, stwTickers, loading, error, earningsError, warning, helpOpen, onToggleHelp, help, updatedAt }: Props) {
  const own = new Set(ownTickers.map((t) => t.toUpperCase()));
  const stw = new Set(stwTickers.map((t) => t.toUpperCase()));
  const [expanded, setExpanded] = useState(false);

  const now = Date.now();
  const todayStartMs = new Date(new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })).getTime();
  const nearCutoff = now + NEAR_DAYS * 86_400_000;
  const cutoff = now + FAR_DAYS * 86_400_000; // build the full set; the view slices to the near window unless expanded

  const eventRows: Row[] = events
    .map((e) => ({ e, ms: new Date(e.releaseTimeEt).getTime() }))
    .filter(({ ms }) => ms >= todayStartMs && ms <= cutoff)
    .map(({ e, ms }): Row => {
      const released = ms <= now && !!e.actual;
      const trend = released ? eventPrintTrend(e.actual as string, e.previous, e.lowerIsBetter) : null;
      return {
        key: `ev-${e.eventName}-${e.releaseTimeEt}`,
        whenMs: ms,
        when: fmtDateTime(e.releaseTimeEt),
        holder: 'var(--t3)',
        holderTip: 'Market-wide print',
        what: `${e.eventName}${e.period ? ` (${e.period})` : ''}`,
        actual: released ? `${e.actual}${trend ? ` ${printGlyph(trend)}` : ''}` : undefined,
        actualColor: trend ? FAVOR_COLOR[trend.favorable] : 'var(--text)',
        insight: released && e.previous ? `vs prev ${e.previous}` : undefined,
        risk: importanceToRisk(e.importance),
      };
    });

  const earningsRows: Row[] = earnings
    .map((e) => ({ e, ms: new Date(`${e.date}T12:00:00Z`).getTime() }))
    .filter(({ ms }) => ms <= cutoff)
    .map(({ e, ms }): Row => {
      const s = e.symbol.toUpperCase();
      const isYours = own.has(s);
      const isStw = stw.has(s);
      const eps = fmtEpsEstimate(e.epsEstimate);
      const hour = earningsHourLabel(e.hour);
      return {
        key: `er-${e.symbol}-${e.date}`,
        whenMs: ms,
        when: `${formatDate(e.date)}${hour ? ` · ${hour}` : ''}`,
        holder: isYours ? 'var(--acc)' : isStw ? 'var(--status-warning-text)' : 'var(--t3)',
        holderTip: isYours ? 'You hold this' : isStw ? 'STW holds this' : 'Market mover',
        what: `${e.symbol} earnings${eps ? ` · est ${eps}` : ''}`,
        risk: isYours || isStw ? 'Med' : 'High',
      };
    });

  const allRows = [...eventRows, ...earningsRows].sort((a, b) => a.whenMs - b.whenMs);
  const rows = expanded ? allRows : allRows.filter((r) => r.whenMs <= nearCutoff);
  const hiddenCount = allRows.length - rows.length;

  return (
    <Card>
      <CardHeader title="Coming up — what could move things" meta={expanded ? `next ${FAR_DAYS} days` : `next ${NEAR_DAYS} days`} helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.5, marginTop: 2, marginBottom: 8 }}>
        Scheduled prints and earnings are temporary overlays — they fade in a few days unless the structure actually shifts.
      </div>
      {helpOpen && <HelpPanel>{help}</HelpPanel>}

      {loading && rows.length === 0 && <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>Loading the calendar…</div>}
      {error && <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--status-negative-text)' }}>Calendar unavailable: {error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>Nothing scheduled in the next {expanded ? FAR_DAYS : NEAR_DAYS} days.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r) => {
          const risk = RISK_STYLE[r.risk];
          return (
            <div key={r.key} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderTop: '1px solid var(--bsub)', flexWrap: 'wrap' }}>
              <span style={{ width: 104, flexShrink: 0, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{r.when}</span>
              <span title={r.holderTip} style={{ width: 14, flexShrink: 0, textAlign: 'center', fontSize: FONT_SIZE.xs, color: r.holder, cursor: 'help' }}>●</span>
              <span style={{ flex: 1, minWidth: 160, fontSize: FONT_SIZE.sm, color: 'var(--text)' }}>
                {r.what}
                {r.actual && (
                  <span style={{ display: 'block', fontSize: FONT_SIZE.xs, lineHeight: 1.5, color: r.actualColor, marginTop: 1 }}>
                    <b>{r.actual}</b> {r.insight && <span style={{ color: 'var(--t3)' }}>— {r.insight}</span>}
                  </span>
                )}
              </span>
              <span style={{
                display: 'inline-flex', padding: '1px 8px', borderRadius: 999, border: `1px solid ${risk.border}`,
                background: risk.bg, color: risk.text, fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                {r.risk}
              </span>
            </div>
          );
        })}
      </div>

      {(expanded || hiddenCount > 0) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'block', marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)',
          }}
        >
          {expanded ? 'Show less ↑' : `Show more — ${hiddenCount} further out (next ${FAR_DAYS} days) ↓`}
        </button>
      )}

      {earningsError && (
        <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--status-warning-text)', marginTop: 8 }}>
          Earnings feed unavailable ({earningsError}) — only macro prints are shown.
        </div>
      )}

      {warning && <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 8 }}>{warning}</div>}

      <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 8 }}>
        <span style={{ color: 'var(--acc)' }}>●</span> you hold it · <span style={{ color: 'var(--status-warning-text)' }}>●</span> STW holds it · <span>●</span> market-mover shown for context
      </div>
      <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 4 }}>
        Source: <a href="https://fred.stlouisfed.org/releases" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t3)', textDecoration: 'underline' }}>FRED econ calendar</a> + <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t3)', textDecoration: 'underline' }}>Finnhub</a> earnings dates{updatedAt ? ` · Updated: ${fmtDateTime(updatedAt)}` : ''}
      </div>
    </Card>
  );
}
