import { useState, type ReactNode, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  evaluateRiskConfig, cashflowAdjustedDrawdownPct, bindingGrossTarget, drawdownLadderStatus,
  regimeGate, regimeExitAdvice, TREND_BUCKET_META, DRAWDOWN_NEAR_BAND_PP, fmtDateTime, formatDate,
  FONT_SIZE, FONT_WEIGHT, SPACE, RADIUS, LETTER_SPACING,
  type PositionInput, type ConcentrationViolation, type ViolationSeverity, type BindingGrossTarget,
  type DrawdownLadderStatus, type RegimeState,
} from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { usePrivacyStore } from '../../store/privacy';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { HelpToggle } from '../../primitives/HelpToggle';
import { StatusPill } from '../../primitives/StatusPill';
import { TickerLink } from '../../primitives/TickerLink';
import { useUserPositions, useUserExecutions } from '../portfolio/useUserPositions';
import { useSyncPortfolio } from '../portfolio/useSyncPortfolio';
import { usePerStockLadders, type PerStockLadderInfo } from '../portfolio/usePerStockLadders';
import { useRegimeInstrumentStore, REGIME_INSTRUMENTS } from '../regime/useRegimeInstrument';
import { useLatestRegime } from '../regime/useLatestRegime';
import type { TickerRegime } from '../picks/useTickerRegime';
import { useRiskConfig, useSectorMap, useViolationAcks, useAcknowledgeViolation, useEnsureRiskConfig } from './useRiskConfig';
import type { ViolationType, AckStatus } from './api';

// ── Risk tab, redesigned (plans/20260720_webapp_redesign) ─────────────────────
// A pure RE-LAYOUT of the live risk engine: every number comes from the existing
// hooks/shared scorers (evaluateRiskConfig, cashflowAdjustedDrawdownPct,
// drawdownLadderStatus, useBindingGrossTarget, usePerStockLadders, the frozen
// regimeGate) — nothing is re-derived here. The new layer is (a) the aggregated
// "verdict banner" over what the engine already computes, and (b) honoring the
// per-guardrail on/off flags (caps/ladder/per_stock/regime) so a disabled
// guardrail neither flags nor shows a breach — it shows a muted "off" state.
// Advisory/display-only; the regime gate is frozen (engine 1.1.0) — read only.

type Sev3 = 'ok' | 'near' | 'breach';

const SEV_TEXT: Record<ViolationSeverity, string> = {
  ok: 'var(--status-positive-text)',
  near: 'var(--status-warning-text)',
  breach: 'var(--status-negative-text)',
  unevaluated: 'var(--t3)',
};
const SEV_BG: Record<ViolationSeverity, string> = {
  ok: 'var(--status-positive-bg)',
  near: 'var(--status-warning-bg)',
  breach: 'var(--status-negative-bg)',
  unevaluated: 'var(--status-neutral-bg)',
};
const SEV_BORDER: Record<ViolationSeverity, string> = {
  ok: 'var(--status-positive-border)',
  near: 'var(--status-warning-border)',
  breach: 'var(--status-negative-border)',
  unevaluated: 'var(--status-neutral-border)',
};
const SEV_PILL_LABEL: Record<Sev3, string> = { ok: 'On track', near: 'Heads-up', breach: 'Action' };

const STATE_COLOR: Record<RegimeState, string> = {
  GREEN: 'var(--acc)', RED: 'var(--status-negative-text)', UNKNOWN: 'var(--t3)',
};

const card: CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.xl, padding: SPACE[4],
};
const sectionLabel: CSSProperties = {
  fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--t3)', marginTop: SPACE[1],
};
const cardTitle: CSSProperties = { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' };
const cardDesc: CSSProperties = { fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.5 };
const bigNum: CSSProperties = { fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, fontVariantNumeric: 'tabular-nums' };
const num: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

function fmtDrawdown(pct: number): string {
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`;
}

/** A muted "this guardrail is off" card body (honors the *_enabled flags). */
function OffState({ title, help, settingsRef }: { title: string; help: string; settingsRef: ReactNode }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap', marginBottom: SPACE[1] }}>
        <span style={cardTitle}>{title}</span>
        <StatusPill variant="neutral">Off</StatusPill>
      </div>
      <div style={{ ...cardDesc, color: 'var(--t2)' }}>
        {help} Turn it back on in {settingsRef}.
      </div>
    </div>
  );
}

// ── verdict banner ────────────────────────────────────────────────────────────

interface BannerItem { severity: 'near' | 'breach'; main: string; sub: string; }

function VerdictBanner({ items }: { items: BannerItem[] }) {
  const breaches = items.filter((i) => i.severity === 'breach').length;
  const worst: Sev3 = breaches > 0 ? 'breach' : items.length > 0 ? 'near' : 'ok';
  const pill = worst === 'breach'
    ? `${breaches} action${breaches === 1 ? '' : 's'}`
    : worst === 'near' ? 'Heads-up' : 'All clear';
  const headline = worst === 'breach'
    ? 'Action suggested on your book'
    : worst === 'near' ? 'A few things to keep an eye on' : "You're within all your guardrails";

  return (
    <div style={{ background: SEV_BG[worst], border: `1px solid ${SEV_BORDER[worst]}`, borderRadius: RADIUS.xl, padding: `${SPACE[3.5]}px ${SPACE[4]}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2.5], flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', padding: `${SPACE[0.5]}px ${SPACE[2]}px`, borderRadius: RADIUS.full,
          border: `1px solid ${SEV_BORDER[worst]}`, background: 'var(--surface)', color: SEV_TEXT[worst],
          fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label,
          textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>{pill}</span>
        <span style={{ fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{headline}</span>
        <span style={{ marginLeft: 'auto', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
          Advisory only — we flag, you decide. Nothing is traded for you.
        </span>
      </div>

      {items.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2], marginTop: SPACE[3] }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE[2.5], background: 'var(--surface)', border: '1px solid var(--bsub)', borderRadius: RADIUS.lg, padding: `${SPACE[2]}px ${SPACE[3]}px` }}>
              <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: RADIUS.full, background: SEV_TEXT[it.severity], marginTop: 6 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FONT_SIZE.sms, color: 'var(--text)', lineHeight: 1.5 }}>{it.main}</div>
                <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: SEV_TEXT[it.severity], lineHeight: 1.5 }}>{it.sub}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: FONT_SIZE.sms, color: 'var(--t2)', marginTop: SPACE[2] }}>
          Nothing is over a cap, near a safety-net step, or past a per-stock stop. Check back after your next sync.
        </div>
      )}
    </div>
  );
}

// ── market health check ───────────────────────────────────────────────────────

function MarketLight({ label, state, note }: { label: string; state: RegimeState; note: string }) {
  const color = STATE_COLOR[state];
  const text = state === 'GREEN' ? (label === 'Trend' ? 'Uptrend' : 'Calm')
    : state === 'RED' ? (label === 'Trend' ? 'Downtrend' : 'Stressed') : 'Unknown';
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--bsub)', borderRadius: RADIUS.lg, padding: `${SPACE[2.5]}px ${SPACE[3]}px` }}>
      <div style={{ ...sectionLabel, marginTop: 0, marginBottom: SPACE[1] }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5] }}>
        <span style={{ width: 10, height: 10, borderRadius: RADIUS.full, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color }}>{text}</span>
      </div>
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 2, lineHeight: 1.4 }}>{note}</div>
    </div>
  );
}

function MarketCard({ instrument, setInstrument, regimeEnabled, structure, settingsRef }: {
  instrument: string;
  setInstrument: (i: string) => void;
  regimeEnabled: boolean;
  structure: TickerRegime | null | undefined;
  settingsRef: ReactNode;
}) {
  const [showNums, setShowNums] = useState(false);
  const { data: row, isLoading } = useLatestRegime(instrument);
  const { data: config } = useRiskConfig(useAuthStore((s) => s.user?.id));

  const gate = row
    ? regimeGate({ close: row.close, sma200: row.sma200 }, { vixClose: row.vix_close, vix3mClose: row.vix3m_close })
    : null;
  const exitRule = config && {
    trimToPct: config.regime_trim_to_pct, stopPct: config.regime_stop_pct, doubleRedGrossPct: config.regime_doublered_gross_pct,
  };
  const advice = gate && exitRule && regimeEnabled ? regimeExitAdvice(gate, exitRule) : null;

  const reds = gate ? (Number(gate.trend_state === 'RED') + Number(gate.vol_state === 'RED')) : 0;
  const sizingKnown = !!gate && gate.trend_state !== 'UNKNOWN' && gate.vol_state !== 'UNKNOWN';
  const sizing = !regimeEnabled ? '—' : !sizingKnown ? '—' : reds === 0 ? '×1.0' : reds === 1 ? '×0.5' : '×0.25';

  const trendNote = structure?.bucket ? TREND_BUCKET_META[structure.bucket].label : 'Price vs its 200-day average';
  const close = structure?.close ?? row?.close ?? null;
  const ma9 = structure?.ma9 ?? null;
  const ma21 = structure?.ma21 ?? null;
  const ma200 = structure?.ma200 ?? row?.sma200 ?? null;

  const chip = (o: { value: string }) => {
    const active = instrument === o.value;
    return (
      <button key={o.value} onClick={() => setInstrument(o.value)} style={{
        fontSize: FONT_SIZE.xs, padding: `2px ${SPACE[2.5]}px`, borderRadius: RADIUS.DEFAULT, border: '1px solid var(--border)',
        background: active ? 'var(--acc)' : 'transparent', color: active ? 'var(--text-inverse)' : 'var(--t2)',
        cursor: 'pointer', fontWeight: FONT_WEIGHT.semibold,
      }}>{o.value}</button>
    );
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap', marginBottom: SPACE[3] }}>
        <span style={cardTitle}>Market health check</span>
        <HelpToggle ariaLabel="About the market health check">
          <span className="block">A read of the broad backdrop from your chosen index: the frozen GREEN/RED gate (trend = price vs its 200-day average; volatility = VIX vs 3-month VIX) plus its finer 9/21/200 structure.</span>
          <span className="block text-t3 mt-1">Suggested sizing scales any NEW position: ×1.0 all-clear, ×0.5 one light red, ×0.25 both red.</span>
          <span className="block text-t3 mt-1">Advisory only — nothing here places or blocks a trade.</span>
        </HelpToggle>
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>measured on</span>
        {REGIME_INSTRUMENTS.map(chip)}
        {row && <span style={{ marginLeft: 'auto', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>{formatDate(row.trading_date)}</span>}
      </div>

      {isLoading ? (
        <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>Loading market regime…</div>
      ) : !row || !gate ? (
        <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>No market regime data yet.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: SPACE[2] }}>
            <MarketLight label="Trend" state={gate.trend_state} note={trendNote} />
            <MarketLight label="Volatility" state={gate.vol_state} note="VIX vs 3-month VIX" />
            <div style={{ background: 'var(--bg)', border: '1px solid var(--bsub)', borderRadius: RADIUS.lg, padding: `${SPACE[2.5]}px ${SPACE[3]}px` }}>
              <div style={{ ...sectionLabel, marginTop: 0, marginBottom: SPACE[1] }}>Suggested sizing</div>
              <div style={{ fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{sizing}</div>
              <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginTop: 2, lineHeight: 1.4 }}>
                {regimeEnabled ? 'for any new position you open' : 'Regime guardrail is off'}
              </div>
            </div>
          </div>

          {advice && (
            <div style={{ marginTop: SPACE[3], padding: `${SPACE[2]}px ${SPACE[3]}px`, borderRadius: RADIUS.md, borderLeft: '3px solid var(--status-warning-border)', background: 'var(--status-warning-bg)', fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55 }}>
              <b style={{ color: 'var(--status-warning-text)' }}>Your red-market playbook kicks in:</b> {advice}{' '}
              <span style={{ color: 'var(--t3)' }}>(You wrote this rule in {settingsRef}.)</span>
            </div>
          )}

          <button onClick={() => setShowNums((v) => !v)} style={{ marginTop: SPACE[3], background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: FONT_SIZE.xs, padding: 0, textDecoration: 'underline' }}>
            {showNums ? 'Hide the numbers behind this' : 'Show the numbers behind this'}
          </button>
          {showNums && (
            <div style={{ marginTop: SPACE[2], background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: RADIUS.lg, padding: `${SPACE[2.5]}px ${SPACE[3]}px`, fontSize: FONT_SIZE.xs, color: 'var(--t2)', lineHeight: 1.6, ...num }}>
              Close {close?.toFixed(2) ?? '—'} · 9MA {ma9?.toFixed(2) ?? '—'} · 21MA {ma21?.toFixed(2) ?? '—'} · 200MA {ma200?.toFixed(2) ?? '—'} · VIX {row.vix_close?.toFixed(2) ?? '—'} vs VIX3M {row.vix3m_close?.toFixed(2) ?? '—'}
              <span style={{ display: 'block', color: 'var(--t3)', marginTop: 2 }}>
                Source: live 9/21 structure from TwelveData · gate from regime_daily · {formatDate(row.trading_date)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── account safety net (drawdown ladder) ──────────────────────────────────────

function LadderViz({ ladder, maxGross, status }: {
  ladder: { drawdownPct: number; targetGrossPct: number }[];
  maxGross: number;
  status: DrawdownLadderStatus;
}) {
  const rungs = [...ladder].sort((a, b) => b.drawdownPct - a.drawdownPct); // -10 → -15
  const scaleMax = Math.max(maxGross, ...rungs.map((r) => r.targetGrossPct), 1);
  const activeDd = status.activeStep?.drawdownPct ?? null;

  interface Seg { key: string; top: string; range: string; target: number; sev: ViolationSeverity | 'muted'; here: boolean; }
  const segs: Seg[] = [
    { key: 'healthy', top: `${maxGross}%`, range: 'At peak', target: maxGross, sev: 'ok', here: activeDd === null },
    ...rungs.map((r) => {
      const breached = status.drawdownPct <= r.drawdownPct;
      const isNext = status.nextStep?.drawdownPct === r.drawdownPct;
      const sev: ViolationSeverity | 'muted' = breached ? 'breach' : (isNext && status.severity === 'near') ? 'near' : 'muted';
      return { key: String(r.drawdownPct), top: `${r.targetGrossPct}%`, range: `Down ${Math.abs(r.drawdownPct)}%+`, target: r.targetGrossPct, sev, here: activeDd === r.drawdownPct };
    }),
  ];
  const fillFor = (s: Seg) => (s.sev === 'muted' ? 'var(--s2)' : SEV_BG[s.sev]);
  const txtFor = (s: Seg) => (s.sev === 'muted' ? 'var(--t3)' : SEV_TEXT[s.sev]);

  return (
    <div style={{ display: 'flex', gap: SPACE[1.5], alignItems: 'flex-end' }}>
      {segs.map((s) => {
        const txt = txtFor(s);
        return (
          <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', height: 13, textAlign: 'center' }}>{s.here ? '▼ you are here' : ''}</span>
            <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: txt, ...num }}>{s.top}</span>
            <div style={{ height: 64, background: 'var(--s2)', borderRadius: RADIUS.md, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden', outline: s.here ? `2px solid ${txt}` : 'none' }}>
              <div style={{ height: Math.round(64 * Math.max(0, Math.min(1, s.target / scaleMax))), background: fillFor(s), borderTop: `2px solid ${txt}` }} />
            </div>
            <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.4 }}>{s.range}</span>
          </div>
        );
      })}
    </div>
  );
}

function SafetyNetCard({ status, ladder, maxGross, nlv, asOf, isLive, money, settingsRef }: {
  status: DrawdownLadderStatus;
  ladder: { drawdownPct: number; targetGrossPct: number }[];
  maxGross: number;
  nlv: number | null;
  asOf: string | null;
  isLive: boolean;
  money: (n: number | null) => string;
  settingsRef: ReactNode;
}) {
  const sev = status.severity;
  const numColor = sev === 'ok' ? 'var(--text)' : SEV_TEXT[sev];
  const belowPeak = nlv != null && status.drawdownPct < 0 ? nlv / (1 + status.drawdownPct / 100) - nlv : 0;

  const sentence = status.activeStep
    ? `You've crossed a safety-net step — your plan is to trim gross exposure to ${status.activeStep.targetGrossPct}%.`
    : status.nextStep
      ? `${status.distanceToNextPp !== null ? `${status.distanceToNextPp.toFixed(1)}pp` : 'A little'} from your next step at ${status.nextStep.drawdownPct}% (which trims gross to ${status.nextStep.targetGrossPct}%).`
      : 'Comfortably above your safety-net steps.';

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap', marginBottom: 2 }}>
        <span style={cardTitle}>Account safety net</span>
        <StatusPill variant={sev}>{SEV_PILL_LABEL[sev as Sev3] ?? 'OK'}</StatusPill>
        <span style={{ marginLeft: 'auto', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', ...num }}>
          {isLive ? 'Finnhub' : 'IBKR'}{asOf ? ` · ${fmtDateTime(asOf)}` : ''}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE[2], margin: `${SPACE[1.5]}px 0 2px` }}>
        <span style={{ ...bigNum, color: numColor }}>{fmtDrawdown(status.drawdownPct)}</span>
        <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>{belowPeak > 0 ? `−${money(belowPeak)} below peak` : 'at your peak'}</span>
      </div>
      <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginBottom: SPACE[3.5] }}>{sentence}</div>
      <LadderViz ladder={ladder} maxGross={maxGross} status={status} />
      <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[1.5] }}>
        Your plan: how much stays invested as your account drawdown deepens. Edit in {settingsRef}.
      </div>
    </div>
  );
}

// ── how much you're invested (gross exposure) ─────────────────────────────────

function InvestedCard({ gross, cap, target, accountEquity, money }: {
  gross: ConcentrationViolation;
  cap: number;
  target: number | null;
  accountEquity: number;
  money: (n: number | null) => string;
}) {
  const pct = gross.exposurePct;
  const sev = gross.severity;
  const numColor = sev === 'ok' ? 'var(--text)' : SEV_TEXT[sev];
  const scaleMax = Math.max(cap, pct, 100) * 1.05;
  const grW = Math.min(100, (pct / scaleMax) * 100);
  const capLeft = Math.min(100, (cap / scaleMax) * 100);
  const targetLeft = target !== null ? Math.min(100, (target / scaleMax) * 100) : null;

  const sentence = pct > cap
    ? `You're invested ${pct.toFixed(1)}% of your account — over your ${cap}% ceiling.`
    : target !== null && pct > target
      ? `You're invested ${pct.toFixed(1)}% — above today's de-risk target of ${target}%.`
      : `You're invested ${pct.toFixed(1)}% of your account. ${cap}% is your ceiling.`;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap', marginBottom: 2 }}>
        <span style={cardTitle}>How much you're invested</span>
        <StatusPill variant={sev}>{SEV_PILL_LABEL[sev as Sev3] ?? 'OK'}</StatusPill>
        <HelpToggle ariaLabel="About gross exposure">
          <span className="block">Your total market value ÷ your account equity (Net Liquidation Value).</span>
          <span className="block text-t3 mt-1">Above 100% means you're using leverage/margin, so a market drop hits your equity harder.</span>
        </HelpToggle>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE[2], margin: `${SPACE[1.5]}px 0 2px` }}>
        <span style={{ ...bigNum, color: numColor }}>{pct.toFixed(1)}%</span>
        <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>≈ {money((pct / 100) * accountEquity)} of {money(accountEquity)}</span>
      </div>
      <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginBottom: SPACE[3] }}>{sentence}</div>
      <div style={{ position: 'relative', height: 14, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: RADIUS.full }}>
        <div style={{ position: 'absolute', left: 0, top: 1, bottom: 1, width: `${grW}%`, background: numColor, borderRadius: RADIUS.full, opacity: 0.85 }} />
        {targetLeft !== null && <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${targetLeft}%`, width: 2, background: 'var(--status-warning-text)' }} title={`De-risk target ${target}%`} />}
        <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${capLeft}%`, width: 2, background: 'var(--text)' }} title={`Cap ${cap}%`} />
      </div>
      <div style={{ display: 'flex', gap: SPACE[4], flexWrap: 'wrap', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[2], ...num }}>
        <span><span style={{ color: 'var(--text)', fontWeight: FONT_WEIGHT.bold }}>▏</span> cap {cap}%</span>
        {target !== null && <span><span style={{ color: 'var(--status-warning-text)', fontWeight: FONT_WEIGHT.bold }}>▏</span> today's de-risk target {target}%</span>}
      </div>
    </div>
  );
}

// ── size caps ─────────────────────────────────────────────────────────────────

interface CapEntry { v: ConcentrationViolation; kind: string; ackType: ViolationType | null; }

function CapRow({ entry, ack, onAcknowledge }: {
  entry: CapEntry;
  ack: { status: AckStatus; glide_path_note: string | null } | undefined;
  onAcknowledge: (status: AckStatus, note?: string) => void;
}) {
  const { v, kind, ackType } = entry;
  const status = ack?.status ?? 'new';
  const [note, setNote] = useState(ack?.glide_path_note ?? '');
  const sev = v.severity;
  const scaleMax = Math.max(v.limitPct, v.exposurePct, 1) * 1.05;
  const barW = Math.min(100, (v.exposurePct / scaleMax) * 100);
  const capLeft = Math.min(100, (v.limitPct / scaleMax) * 100);
  const unevaluated = sev === 'unevaluated';
  const over = v.exposurePct - v.limitPct;
  const sub = unevaluated
    ? 'No sector mapping yet — map its sector to include it.'
    : over > 0 ? `Over by ${over.toFixed(1)}pp.` : `${Math.abs(over).toFixed(1)}pp of room left.`;
  const canAck = ackType !== null && sev === 'breach';

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--bsub)', borderRadius: RADIUS.lg, padding: `${SPACE[2.5]}px ${SPACE[3]}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{v.scope}</span>
        <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>{kind}</span>
        {!unevaluated && (
          <span style={{ marginLeft: 'auto', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: SEV_TEXT[sev], ...num }}>
            {v.exposurePct.toFixed(1)}% / {v.limitPct}%
          </span>
        )}
        <StatusPill variant={sev}>{sev === 'breach' ? 'Breach' : sev === 'near' ? 'Near' : sev === 'unevaluated' ? 'Unevaluated' : 'OK'}</StatusPill>
      </div>
      {!unevaluated && (
        <div style={{ position: 'relative', height: 8, background: 'var(--s2)', borderRadius: RADIUS.full, margin: `${SPACE[2]}px 0 ${SPACE[1]}px` }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barW}%`, background: SEV_TEXT[sev], borderRadius: RADIUS.full }} />
          <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${capLeft}%`, width: 2, background: 'var(--text)' }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2.5], flexWrap: 'wrap', marginTop: SPACE[1] }}>
        <span style={{ fontSize: FONT_SIZE.xs, color: unevaluated ? 'var(--t3)' : SEV_TEXT[sev], lineHeight: 1.5 }}>{sub}</span>
        {canAck && status === 'new' && (
          <button onClick={() => onAcknowledge('acknowledged')} style={{ marginLeft: 'auto', padding: `3px ${SPACE[2.5]}px`, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, borderRadius: RADIUS.md, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Got it — I'll handle this
          </button>
        )}
        {canAck && status !== 'new' && (
          <span style={{ marginLeft: 'auto', fontSize: FONT_SIZE.xs, color: 'var(--status-positive-text)', whiteSpace: 'nowrap' }}>Acknowledged ✓</span>
        )}
      </div>
      {canAck && status !== 'new' && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note.trim() && note !== (ack?.glide_path_note ?? '')) onAcknowledge('glide_path', note); }}
          placeholder="Write your plan — e.g. no adds; trim back under the cap by Aug 1"
          style={{ width: '100%', marginTop: SPACE[2], background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.md, padding: `6px ${SPACE[2]}px`, fontSize: FONT_SIZE.sm, color: 'var(--text)' }}
        />
      )}
    </div>
  );
}

function SizeCapsCard({ entries, ackFor, onAcknowledge }: {
  entries: CapEntry[];
  ackFor: (scope: string, type: ViolationType) => { status: AckStatus; glide_path_note: string | null } | undefined;
  onAcknowledge: (scope: string, type: ViolationType, status: AckStatus, note?: string) => void;
}) {
  const [showOk, setShowOk] = useState(false);
  const RANK: Record<ViolationSeverity, number> = { breach: 0, near: 1, unevaluated: 2, ok: 3 };
  const exceptions = entries.filter((e) => e.v.severity !== 'ok').sort((a, b) => RANK[a.v.severity] - RANK[b.v.severity]);
  const okOnes = entries.filter((e) => e.v.severity === 'ok');
  const total = entries.length;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap', marginBottom: 2 }}>
        <span style={cardTitle}>Size caps</span>
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{exceptions.length ? `${exceptions.length} to review` : `all ${total} within caps`}</span>
      </div>
      <div style={{ ...cardDesc, marginBottom: SPACE[2.5] }}>How big any one stock, sector, or options bet is vs the caps you set. Only exceptions are shown.</div>
      {exceptions.length === 0 ? (
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', background: 'var(--status-positive-bg)', border: '1px solid var(--status-positive-border)', borderRadius: RADIUS.lg, padding: `${SPACE[2]}px ${SPACE[3]}px` }}>
          All {total} within their caps — nothing to show.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2.5] }}>
          {exceptions.map((e) => (
            <CapRow
              key={`${e.ackType}-${e.v.scope}`}
              entry={e}
              ack={e.ackType ? ackFor(e.v.scope, e.ackType) : undefined}
              onAcknowledge={(status, note) => e.ackType && onAcknowledge(e.v.scope, e.ackType, status, note)}
            />
          ))}
        </div>
      )}
      {okOnes.length > 0 && (
        <>
          <button onClick={() => setShowOk((v) => !v)} style={{ marginTop: SPACE[2.5], background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: FONT_SIZE.xs, padding: 0, textDecoration: 'underline' }}>
            {showOk ? 'Hide the ones within their caps' : `Show the ${okOnes.length} within their caps`}
          </button>
          {showOk && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE[1.5], marginTop: SPACE[2] }}>
              {okOnes.map((e) => (
                <span key={`${e.ackType}-${e.v.scope}`} style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: RADIUS.md, padding: `2px ${SPACE[2]}px`, ...num }}>
                  {e.v.scope} {e.v.exposurePct.toFixed(1)}%
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── per-stock stops ───────────────────────────────────────────────────────────

interface StopRow { ticker: string; kind: 'shares' | 'options'; info: PerStockLadderInfo; }

type Rung = { drawdownPct: number; holdFractionPct: number };

/** "5%→keep ≤75% · 10%→keep ≤50% · … · 20%→sell all" — the full ladder, matching the mock. */
function fmtStops(rungs: Rung[]): string {
  return rungs.map((x) => `${Math.abs(x.drawdownPct)}%→${x.holdFractionPct === 0 ? 'sell all' : `keep ≤${x.holdFractionPct}%`}`).join(' · ');
}

function PerStockStopsCard({ rows, ladderRungs, optionRungs, showMoney, money }: {
  rows: StopRow[];
  ladderRungs: Rung[];
  optionRungs: Rung[];
  showMoney: boolean;
  money: (n: number | null) => string;
}) {
  const exceptions = rows
    .filter((r) => r.info.status.severity === 'near' || r.info.status.severity === 'breach')
    .sort((a, b) => a.info.status.drawdownPct - b.info.status.drawdownPct);

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap', marginBottom: 2 }}>
        <span style={cardTitle}>Per-stock stops</span>
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{exceptions.length ? `${exceptions.length} ${exceptions.length === 1 ? 'position needs' : 'positions need'} a look` : 'all quiet'}</span>
      </div>
      <div style={{ ...cardDesc, marginBottom: SPACE[2.5] }}>Each position measured against your buy price. One appears here only when it's near or past one of your stop steps.</div>
      {exceptions.length === 0 ? (
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', background: 'var(--status-positive-bg)', border: '1px solid var(--status-positive-border)', borderRadius: RADIUS.lg, padding: `${SPACE[2]}px ${SPACE[3]}px` }}>
          No position is near a stop right now.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2.5] }}>
          {exceptions.map((r) => {
            const s = r.info.status;
            const sev = s.severity as Sev3;
            const rungs = r.kind === 'options' ? optionRungs : ladderRungs;
            // Position value ≈ |qty| × price (× the standard 100 multiplier for options).
            const posVal = Math.abs(r.info.currentQty) * r.info.currentPrice * (r.kind === 'options' ? 100 : 1);
            const holdKnown = s.currentHoldPct !== null && !r.info.historyIncomplete;

            let plan: string;
            if (sev === 'breach' && s.activeRung) {
              const dd = Math.abs(s.activeRung.drawdownPct);
              const keep = s.activeRung.holdFractionPct;
              if (holdKnown) {
                const held = s.currentHoldPct! >= 99.5 ? 'all of it' : `${s.currentHoldPct!.toFixed(0)}%`;
                const trimAmt = (Math.max(0, s.currentHoldPct! - keep) / 100) * posVal;
                const trim = showMoney && trimAmt > 0 ? ` → trim ≈ ${money(trimAmt)}` : '';
                plan = `Past the ${dd}% stop — your plan: keep at most ${keep}% of the position. You still hold ${held}${trim}.`;
              } else {
                plan = `Past the ${dd}% stop — your plan: keep at most ${keep}% of the position. (Holding vs peak unknown — incomplete fill history.)`;
              }
            } else if (sev === 'near' && s.nextRung) {
              const dd = Math.abs(s.nextRung.drawdownPct);
              const keep = s.nextRung.holdFractionPct;
              const away = s.distanceToNextPp !== null ? Math.abs(s.distanceToNextPp).toFixed(1) : '—';
              plan = `${away} points from its next stop (${dd}% down → keep at most ${keep}%). Nothing to do yet.`;
            } else {
              plan = 'Near a stop.';
            }

            const detail = showMoney
              ? `Position ≈ ${money(posVal)} · your stops: ${fmtStops(rungs)}`
              : `Your stops: ${fmtStops(rungs)}`;

            return (
              <div key={`${r.kind}-${r.ticker}`} style={{ background: 'var(--bg)', border: '1px solid var(--bsub)', borderRadius: RADIUS.lg, padding: `${SPACE[2.5]}px ${SPACE[3]}px` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap' }}>
                  <TickerLink ticker={r.ticker} style={{ color: 'var(--acc)', fontSize: FONT_SIZE.sms }} />
                  <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>{r.kind}</span>
                  <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: SEV_TEXT[sev], ...num }}>{fmtDrawdown(s.drawdownPct)}</span>
                  <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>from entry</span>
                  <span style={{ marginLeft: 'auto' }}><StatusPill variant={sev}>{sev === 'breach' ? 'Action' : 'Heads-up'}</StatusPill></span>
                </div>
                <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginTop: SPACE[1] }}>{plan}</div>
                <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[1], ...num }}>{detail}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── glossary ──────────────────────────────────────────────────────────────────

function Glossary() {
  const [open, setOpen] = useState(false);
  const term: CSSProperties = { color: 'var(--text)', fontWeight: FONT_WEIGHT.semibold };
  return (
    <div style={{ ...card, padding: `${SPACE[3]}px ${SPACE[4]}px` }}>
      <button onClick={() => setOpen((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: FONT_SIZE.xs, padding: 0, textDecoration: 'underline' }}>
        {open ? 'Hide the plain-English glossary' : '? What do these terms mean'}
      </button>
      {open && (
        <div style={{ marginTop: SPACE[2], fontSize: FONT_SIZE.xs, color: 'var(--t2)', lineHeight: 1.7 }}>
          <b style={term}>Invested</b> — the combined size of all your positions ("gross exposure"). Over 100% means you're borrowing on margin.<br />
          <b style={term}>Down / drawdown</b> — how far your account sits below its highest value, adjusted for deposits and withdrawals so adding cash never looks like a loss.<br />
          <b style={term}>Safety-net step</b> — a line in your plan: "if I'm down X%, cut invested to Y%". Set in Settings.<br />
          <b style={term}>Cap</b> — the most of your account you allow in one stock, one sector, or in options on one name.<br />
          <b style={term}>Trend / volatility lights</b> — the daily market health check: is the market still in an uptrend, and how violently are prices swinging.<br />
          <b style={term}>Advisory</b> — everything on this page is a heads-up. Nothing here ever places or blocks a trade.
        </div>
      )}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export function ViolationsSummary({ showSyncButton = false, settingsTo, bindingGross, drawdown, regimeStructure }: {
  showSyncButton?: boolean;
  settingsTo?: string;
  /** Reconciled ladder-vs-regime gross target from the parent's useBindingGrossTarget. */
  bindingGross?: BindingGrossTarget | null;
  /** Live NLV for the drawdown READ (Item 2), from the parent's useLiveNlv. */
  drawdown?: { nlv: number | null; asOf: string | null; isLive: boolean };
  /** The chosen index's live 9/21/200 structure (from useTickerRegime in the parent). */
  regimeStructure?: TickerRegime | null;
}) {
  const userId = useAuthStore((s) => s.user?.id);
  const showMoney = usePrivacyStore((s) => s.showMoney);

  const settingsRef: ReactNode = settingsTo
    ? <Link to={settingsTo} style={{ color: 'var(--acc)', fontWeight: FONT_WEIGHT.semibold }}>Settings</Link>
    : 'Settings';

  const { data: positions, isLoading: positionsLoading } = useUserPositions();
  const { data: executions = [] } = useUserExecutions();
  const { data: config, isLoading: configLoading } = useRiskConfig(userId);
  const { data: sectorMap } = useSectorMap();
  const { data: acks } = useViolationAcks(userId);
  const acknowledge = useAcknowledgeViolation(userId);
  const { sync, isSyncing, syncError } = useSyncPortfolio();
  const instrument = useRegimeInstrumentStore((s) => s.instrument);
  const setInstrument = useRegimeInstrumentStore((s) => s.setInstrument);

  useEnsureRiskConfig(userId, config, configLoading);

  // Per-stock ladders — shares vs options use their OWN ladder (migration 078 honoring).
  const stockLadders = usePerStockLadders(positions ?? [], executions, config, 'STK');
  const optionLadders = usePerStockLadders(positions ?? [], executions, config, 'OPT');

  if (positionsLoading || configLoading || !config) return <LoadingSpinner className="mt-8" />;

  const money = (n: number | null): string => {
    if (n === null) return '—';
    if (!showMoney) return '•••';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  };

  const capsEnabled = config.caps_enabled;
  const ladderEnabled = config.ladder_enabled;
  const perStockEnabled = config.per_stock_enabled;
  const regimeEnabled = config.regime_enabled;

  const positionInputs: PositionInput[] = (positions ?? []).map((p) => ({
    underlying: p.underlying, quantity: p.quantity, markPrice: p.mark_price, multiplier: p.multiplier, isOption: p.asset_class === 'OPT',
  }));

  // One source: ibkr_nlv is the concentration denominator (never re-derived).
  const accountEquity = config.ibkr_nlv ?? config.account_equity;

  // Drawdown reads off the LIVE NLV supplied by the parent (Option A); peak + denominator stay synced.
  const ddNlv = drawdown ? drawdown.nlv : config.ibkr_nlv;
  const ddAsOf = drawdown ? drawdown.asOf : config.ibkr_nlv_at;
  const ddIsLive = drawdown?.isLive ?? false;
  const drawdownPct = cashflowAdjustedDrawdownPct(ddNlv, config.equity_peak, config.cumulative_cashflow, config.equity_peak_cashflow);
  const nearBand = config.drawdown_near_band_pp ?? DRAWDOWN_NEAR_BAND_PP;
  const ladderStatus = drawdownPct === null ? null : drawdownLadderStatus(config.ladder, drawdownPct, nearBand);

  const result = evaluateRiskConfig(positionInputs, sectorMap ?? {}, accountEquity, {
    maxPositionPct: config.max_position_pct,
    maxOptionPositionPct: config.max_option_position_pct,
    maxSectorPct: config.max_sector_pct,
    maxGrossPct: config.max_gross_pct,
    ladder: config.ladder,
  }, drawdownPct);

  // Gate the binding gross target's two legs by their enabled flags, then re-reconcile
  // through the same shared "tightest binds" reducer (no NLV/target re-derivation).
  const gatedLadderPct = ladderEnabled ? (bindingGross?.ladderPct ?? null) : null;
  const gatedRegimePct = regimeEnabled ? (bindingGross?.regimePct ?? null) : null;
  const gatedBinding = bindingGrossTarget(gatedLadderPct, gatedRegimePct);

  // Size-cap entries (position / option / sector), only when caps are enabled.
  const capEntries: CapEntry[] = capsEnabled ? [
    ...result.positionViolations.map((v): CapEntry => ({ v, kind: 'single-stock cap', ackType: 'position' })),
    ...result.optionViolations.map((v): CapEntry => ({ v, kind: 'options cap', ackType: null })),
    ...result.sectorViolations.map((v): CapEntry => ({ v, kind: 'sector cap', ackType: 'sector' })),
  ] : [];

  const stopRows: StopRow[] = perStockEnabled ? [
    ...[...stockLadders.entries()].map(([ticker, info]): StopRow => ({ ticker, kind: 'shares', info })),
    ...[...optionLadders.entries()].map(([ticker, info]): StopRow => ({ ticker, kind: 'options', info })),
  ] : [];

  // ── verdict banner aggregation (the new layer over engine output) ──
  const items: BannerItem[] = [];
  if (ladderEnabled && ladderStatus && ladderStatus.severity !== 'ok') {
    if (ladderStatus.activeStep) {
      items.push({ severity: 'breach', main: `Your account is down ${Math.abs(ladderStatus.drawdownPct).toFixed(1)}% — past a safety-net step.`, sub: `Plan: trim gross exposure to ${ladderStatus.activeStep.targetGrossPct}%.` });
    } else if (ladderStatus.nextStep) {
      items.push({ severity: 'near', main: `Your account is down ${Math.abs(ladderStatus.drawdownPct).toFixed(1)}% — nearing a safety-net step.`, sub: `Next step at ${ladderStatus.nextStep.drawdownPct}% → hold gross to ${ladderStatus.nextStep.targetGrossPct}%.` });
    }
  }
  if (result.grossViolation.severity === 'breach') {
    items.push({ severity: 'breach', main: `You're invested ${result.grossViolation.exposurePct.toFixed(1)}% of your account — over your ${config.max_gross_pct}% cap.`, sub: 'Consider trimming back toward your cap.' });
  } else if (gatedBinding && result.grossViolation.exposurePct > gatedBinding.targetPct) {
    items.push({ severity: 'near', main: `You're invested ${result.grossViolation.exposurePct.toFixed(1)}% — above today's de-risk target.`, sub: `Target is ${gatedBinding.targetPct}% (from your ${gatedBinding.source === 'regime' ? 'red-market rule' : gatedBinding.source === 'both' ? 'drawdown + red-market rules' : 'drawdown ladder'}).` });
  }
  for (const e of capEntries) {
    if (e.v.severity !== 'breach' && e.v.severity !== 'near') continue;
    const over = e.v.exposurePct - e.v.limitPct;
    items.push({
      severity: e.v.severity,
      main: `${e.v.scope} is ${e.v.exposurePct.toFixed(1)}% of your book — ${e.v.severity === 'breach' ? 'over' : 'near'} your ${e.v.limitPct}% ${e.kind}.`,
      sub: e.v.severity === 'breach' ? `Over by ${over.toFixed(1)}pp.` : 'Approaching the cap.',
    });
  }
  for (const r of stopRows) {
    const s = r.info.status;
    if (s.severity !== 'breach' && s.severity !== 'near') continue;
    items.push({
      severity: s.severity,
      main: `${r.ticker} ${r.kind} down ${Math.abs(s.drawdownPct).toFixed(1)}% from entry — ${s.severity === 'breach' ? 'past' : 'near'} a stop.`,
      sub: s.severity === 'breach'
        ? (s.targetHoldPct !== null ? `Plan: reduce to ${s.targetHoldPct}% of peak size.` : 'Reduce per your stop plan.')
        : (s.nextRung ? `Next stop at ${s.nextRung.drawdownPct}%.` : 'Approaching a stop.'),
    });
  }
  // Order breach-first so the banner reads worst-first.
  items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'breach' ? -1 : 1));

  function ackFor(scope: string, type: ViolationType) {
    return acks?.find((a) => a.scope === scope && a.violation_type === type);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>
      {showSyncButton && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => sync()} disabled={isSyncing} style={{ padding: `${SPACE[1.5]}px ${SPACE[3]}px`, borderRadius: RADIUS.md, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, background: 'var(--acc)', color: 'var(--text-inverse)', border: 'none', cursor: 'pointer', opacity: isSyncing ? 0.6 : 1 }}>
            {isSyncing ? 'Syncing…' : 'Sync & Evaluate'}
          </button>
        </div>
      )}
      {syncError && (
        <div style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium, color: 'var(--status-negative-text)', background: 'var(--status-negative-bg)', border: '1px solid var(--status-negative-border)', borderRadius: RADIUS.md, padding: `${SPACE[2]}px ${SPACE[3]}px` }}>
          Sync failed: {syncError} — evaluating against last-synced data below.
        </div>
      )}

      <VerdictBanner items={items} />

      <div style={sectionLabel}>The market right now</div>
      <MarketCard instrument={instrument} setInstrument={setInstrument} regimeEnabled={regimeEnabled} structure={regimeStructure} settingsRef={settingsRef} />

      <div style={sectionLabel}>Your account vs your plan</div>

      {!ladderEnabled ? (
        <OffState title="Account safety net" help="Your drawdown safety net is off — no de-risk steps are being tracked." settingsRef={settingsRef} />
      ) : ladderStatus ? (
        <SafetyNetCard status={ladderStatus} ladder={config.ladder} maxGross={config.max_gross_pct} nlv={ddNlv} asOf={ddAsOf} isLive={ddIsLive} money={money} settingsRef={settingsRef} />
      ) : (
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: SPACE[1] }}>Account safety net</div>
          <div style={{ ...cardDesc, color: 'var(--t2)' }}>Silent until a live account value and a peak exist (connect IBKR with the NAV section in {settingsRef}).</div>
        </div>
      )}

      <InvestedCard gross={result.grossViolation} cap={config.max_gross_pct} target={gatedBinding?.targetPct ?? null} accountEquity={accountEquity} money={money} />

      {capsEnabled ? (
        <SizeCapsCard
          entries={capEntries}
          ackFor={ackFor}
          onAcknowledge={(scope, type, status, note) => acknowledge.mutate({ scope, violationType: type, status, glidePathNote: note })}
        />
      ) : (
        <OffState title="Size caps" help="Your single-stock, sector, and options caps are off — concentration isn't being flagged." settingsRef={settingsRef} />
      )}

      {perStockEnabled ? (
        <PerStockStopsCard rows={stopRows} ladderRungs={config.per_stock_ladder} optionRungs={config.per_stock_option_ladder} showMoney={showMoney} money={money} />
      ) : (
        <OffState title="Per-stock stops" help="Your per-position stops are off — individual names aren't being measured against your entry." settingsRef={settingsRef} />
      )}

      <Glossary />
    </div>
  );
}
