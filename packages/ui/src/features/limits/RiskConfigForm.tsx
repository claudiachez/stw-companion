import { useState } from 'react';
import {
  FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, RADIUS, SHADOW, SPACE,
  type DrawdownStep, type PerStockDrawdownStep,
} from '@stw/shared';
import { Button } from '../../primitives/Button';
import { FormRow, type FormRowProps } from '../../primitives/FormRow';
import { TextInput } from '../../primitives/TextInput';
import { AlertStrip } from '../../primitives/AlertStrip';
import { useIsMobile } from '../../hooks/useIsMobile';
import { usePrivacyStore } from '../../store/privacy';
import type { RiskConfigRow } from './api';
import { useSaveRiskConfig } from './useRiskConfig';

// 2026-07-20 Settings redesign: the single guardrails card becomes a 4-tab layout
// (caps / account safety-net ladder / per-position stops / red-market playbook), each
// with its own on/off toggle + a draggable colored-column viz. One `draft`, one Save,
// same advisory-only semantics as before — nothing here places or blocks a trade.
// Ports plans/20260720_webapp_redesign/refs/Settings - Redesigned.dc.html.

// COLORS: green (ok) → amber (caution) → red (deep), capped at red. The mock's
// --pos-*/--warn/--neg map onto our status tokens (packages/ui/src/styles/tokens.css).
const COLORS = [
  { fill: 'var(--status-positive-bg)', txt: 'var(--status-positive-text)' },
  { fill: 'var(--status-warning-bg)', txt: 'var(--status-warning-text)' },
  { fill: 'var(--status-negative-bg)', txt: 'var(--status-negative-text)' },
] as const;
const rungColor = (i: number) => COLORS[Math.min(i, 2)];

const smallInput: React.CSSProperties = { width: 56, background: 'var(--surface)' };
// Fixed-width right-aligned prefix slot so every input after it starts at the same x —
// same convention as the old form / ConfigPage's `rowPrefix`.
const prefixSlot: React.CSSProperties = { width: 22, flexShrink: 0, textAlign: 'right', fontSize: FONT_SIZE.sm, color: 'var(--t2)' };
const inlineText: React.CSSProperties = { fontSize: FONT_SIZE.sm, color: 'var(--t2)' };
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// ── draggable column ──────────────────────────────────────────────────────────
interface Seg {
  top: string;
  range: string;
  /** Fill height in px (0–64). */
  h: number;
  fill: string;
  txt: string;
  /** Absent = fixed/non-draggable (the first "100%" segment). */
  onDrag?: (pct: number) => void;
}

/** Pointer-drag a column: pct = clamp(0..100, (bottom - clientY)/height*100), rounded.
 * Captures the track rect at pointerdown and applies live until pointerup. */
function startDrag(e: React.PointerEvent, apply: (pct: number) => void) {
  e.preventDefault();
  const rect = e.currentTarget.getBoundingClientRect();
  const compute = (clientY: number) => Math.round(Math.min(100, Math.max(0, ((rect.bottom - clientY) / rect.height) * 100)));
  apply(compute(e.clientY));
  const move = (ev: PointerEvent) => apply(compute(ev.clientY));
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function LadderViz({ segs, caption }: { segs: Seg[]; caption: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: SPACE[1.5], alignItems: 'flex-end', marginBottom: SPACE[1.5] }}>
        {segs.map((s, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SPACE[1] }}>
            <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: s.txt, fontVariantNumeric: 'tabular-nums' }}>{s.top}</span>
            <div
              onPointerDown={s.onDrag ? (e) => startDrag(e, s.onDrag!) : undefined}
              style={{
                height: 64, background: 'var(--s2)', borderRadius: RADIUS.md, display: 'flex',
                flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden',
                cursor: s.onDrag ? 'ns-resize' : 'default', touchAction: 'none',
              }}
            >
              <div style={{ height: s.h, background: s.fill, borderTop: `2px solid ${s.txt}`, pointerEvents: 'none' }} />
            </div>
            <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.4 }}>{s.range}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginBottom: SPACE[3.5] }}>{caption}</div>
    </div>
  );
}

// ── small primitives ──────────────────────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Turn this guardrail on or off"
      style={{
        width: 40, height: 22, borderRadius: RADIUS.full, cursor: 'pointer', position: 'relative', padding: 0, flexShrink: 0,
        border: `1px solid ${on ? 'var(--acc)' : 'var(--border)'}`, background: on ? 'var(--acc)' : 'var(--border)',
      }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: RADIUS.full, background: 'var(--text-inverse)', boxShadow: SHADOW.card, transition: 'left 150ms ease' }} />
    </button>
  );
}

function ToggleBar({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2.5], flexWrap: 'wrap', background: 'var(--surface-inset)', border: '1px solid var(--bsub)', borderRadius: RADIUS.lg, padding: `${SPACE[2]}px ${SPACE[3]}px`, marginBottom: SPACE[3] }}>
      <Toggle on={on} onToggle={onToggle} />
      <span style={{ fontSize: FONT_SIZE.sm, color: on ? 'var(--t2)' : 'var(--t3)', lineHeight: 1.5, flex: 1, minWidth: 200 }}>
        {on
          ? 'This guardrail is ON — it flags and alerts when a level is crossed.'
          : 'This guardrail is OFF — no flags or notifications from this section. Leave it off if it fights your strategy (e.g. you DCA into drawdowns instead of cutting).'}
      </span>
    </div>
  );
}

/** Compact numeric row (caps / near-band): label, input, unit + optional dollar. */
function NumRow({ label, value, onChange, suffix, note, dollar, min, max, layout }: {
  label: string; value: number; onChange: (v: number) => void; suffix: string;
  note?: string; dollar?: string; min?: number; max?: number; layout: FormRowProps['layout'];
}) {
  return (
    <FormRow layout={layout} label={label} hint={note}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap' }}>
        <TextInput type="number" min={min} max={max} style={{ width: 64 }}
          value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span style={inlineText}>{suffix}</span>
        {dollar && <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{dollar}</span>}
      </div>
    </FormRow>
  );
}

function HelpToggle({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onToggle}
        style={{ marginTop: SPACE[3.5], display: 'block', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: FONT_SIZE.xs, padding: 0, textDecoration: 'underline' }}>
        {open ? 'Hide the plain-English glossary' : '? What do these terms mean'}
      </button>
      {open && (
        <div style={{ marginTop: SPACE[2], background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: RADIUS.lg, padding: `${SPACE[2.5]}px ${SPACE[3]}px`, fontSize: FONT_SIZE.xs, color: 'var(--t2)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: SPACE[1.5] }}>
          {children}
        </div>
      )}
    </div>
  );
}

const glossaryTerm: React.CSSProperties = { color: 'var(--text)', fontWeight: FONT_WEIGHT.semibold };
const addStepBtn: React.CSSProperties = { marginTop: SPACE[2], background: 'none', border: '1px dashed var(--border)', borderRadius: RADIUS.md, padding: `${SPACE[1]}px ${SPACE[2.5]}px`, fontSize: FONT_SIZE.sm, color: 'var(--t2)', cursor: 'pointer' };
const stepPill: React.CSSProperties = { flexShrink: 0, fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color: 'var(--t3)', width: 48 };
const rowCard: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap', background: 'var(--surface-inset)', border: '1px solid var(--bsub)', borderRadius: RADIUS.lg, padding: `${SPACE[2]}px ${SPACE[2.5]}px` };
const removeBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: FONT_SIZE.sm, padding: `0 ${SPACE[1]}px`, marginLeft: 'auto' };

// ── warnings (mock semantics; only warn for an ENABLED tab) ────────────────────
function capWarnings(pos: number, opt: number, sector: number, gross: number): string[] {
  const w: string[] = [];
  if (opt > pos) w.push(`Your options-only cap (${opt}%) is looser than your one-stock cap (${pos}%) — it's meant to be tighter.`);
  if (pos > sector) w.push(`One stock (${pos}%) can't be allowed more room than its whole sector (${sector}%).`);
  if (sector > gross) w.push(`One sector (${sector}%) can't be allowed more room than everything combined (${gross}%).`);
  return w;
}
function grossLadderWarnings(ladder: DrawdownStep[], label: string): string[] {
  const w: string[] = [];
  for (let i = 1; i < ladder.length; i++) {
    if (Math.abs(ladder[i].drawdownPct) <= Math.abs(ladder[i - 1].drawdownPct)) w.push(`${label}: step ${i + 1} should be a deeper drop than step ${i}.`);
    else if (ladder[i].targetGrossPct > ladder[i - 1].targetGrossPct) w.push(`${label}: step ${i + 1} keeps more invested than step ${i} — deeper drops should cut more.`);
  }
  return w;
}
function holdLadderWarnings(ladder: PerStockDrawdownStep[], label: string): string[] {
  const w: string[] = [];
  for (let i = 1; i < ladder.length; i++) {
    if (Math.abs(ladder[i].drawdownPct) <= Math.abs(ladder[i - 1].drawdownPct)) w.push(`${label}: step ${i + 1} should be a deeper drop than step ${i}.`);
    else if (ladder[i].holdFractionPct > ladder[i - 1].holdFractionPct) w.push(`${label}: step ${i + 1} keeps more of the position than step ${i} — deeper drops should keep less.`);
  }
  return w;
}
function redMarketWarnings(doubleRed: number, trimTo: number): string[] {
  return doubleRed > trimTo ? [`Red-market playbook: the both-red level (${doubleRed}%) should be at or below the one-red trim (${trimTo}%) — the worse case can't keep more on.`] : [];
}
function crossPolicyWarnings(doubleRed: number, ladder: DrawdownStep[]): string[] {
  if (ladder.length === 0) return [];
  const floor = Math.min(...ladder.map((r) => r.targetGrossPct));
  return doubleRed > floor
    ? [`Your both-red target (${doubleRed}% invested) is looser than your deepest safety-net step (${floor}%). A fully red market is usually at least as serious — set it at or below ${floor}%.`]
    : [];
}

const TABS = [
  { title: 'Position size caps', caption: 'How big any one bet can get' },
  { title: 'Account safety net', caption: 'If your whole account falls' },
  { title: 'Per-position stops', caption: 'If a single stock or option falls' },
  { title: 'Red-market playbook', caption: 'When the market light turns RED' },
] as const;

export function RiskConfigForm({ userId, config }: { userId: string; config: RiskConfigRow }) {
  const save = useSaveRiskConfig(userId);
  const isMobile = useIsMobile();
  const rowLayout: FormRowProps['layout'] = isMobile ? 'stacked' : 'horizontal';
  const showMoney = usePrivacyStore((s) => s.showMoney);

  const [tab, setTab] = useState(0);
  const [scope, setScope] = useState<'stocks' | 'options'>('stocks');
  const [helpOpen, setHelpOpen] = useState(false);
  const [draft, setDraft] = useState<{
    maxPositionPct?: number; maxOptionPositionPct?: number; maxSectorPct?: number; maxGrossPct?: number;
    accountEquity?: number; ladder?: DrawdownStep[];
    perStockLadder?: PerStockDrawdownStep[]; perStockOptionLadder?: PerStockDrawdownStep[];
    drawdownNearBandPp?: number;
    regimeTrimToPct?: number; regimeStopPct?: number; regimeDoubleRedGrossPct?: number;
    capsEnabled?: boolean; ladderEnabled?: boolean; perStockEnabled?: boolean; regimeEnabled?: boolean;
  }>({});

  const maxPositionPct = draft.maxPositionPct ?? config.max_position_pct;
  const maxOptionPositionPct = draft.maxOptionPositionPct ?? config.max_option_position_pct;
  const maxSectorPct = draft.maxSectorPct ?? config.max_sector_pct;
  const maxGrossPct = draft.maxGrossPct ?? config.max_gross_pct;
  const accountEquity = draft.accountEquity ?? config.account_equity;
  const ladder = draft.ladder ?? config.ladder;
  const perStockLadder = draft.perStockLadder ?? config.per_stock_ladder ?? [];
  const perStockOptionLadder = draft.perStockOptionLadder ?? config.per_stock_option_ladder ?? [];
  const drawdownNearBandPp = draft.drawdownNearBandPp ?? config.drawdown_near_band_pp ?? 2;
  const regimeTrimToPct = draft.regimeTrimToPct ?? config.regime_trim_to_pct;
  const regimeStopPct = draft.regimeStopPct ?? config.regime_stop_pct;
  const regimeDoubleRedGrossPct = draft.regimeDoubleRedGrossPct ?? config.regime_doublered_gross_pct;
  const capsEnabled = draft.capsEnabled ?? config.caps_enabled ?? true;
  const ladderEnabled = draft.ladderEnabled ?? config.ladder_enabled ?? true;
  const perStockEnabled = draft.perStockEnabled ?? config.per_stock_enabled ?? true;
  const regimeEnabled = draft.regimeEnabled ?? config.regime_enabled ?? true;

  // Live IBKR NLV wins as the denominator; else the (possibly-edited) account_equity.
  const equity = config.ibkr_nlv ?? accountEquity;
  const dPos = (pct: number) => (showMoney ? `≈ ${money.format((equity * pct) / 100)}` : '');
  const dNeg = (pct: number) => (showMoney ? `−${money.format((equity * pct) / 100)}` : '');

  const dirty = Object.keys(draft).length > 0;
  const enabledForTab = [capsEnabled, ladderEnabled, perStockEnabled, regimeEnabled];

  const warnings = [
    ...(capsEnabled ? capWarnings(maxPositionPct, maxOptionPositionPct, maxSectorPct, maxGrossPct) : []),
    ...(ladderEnabled ? grossLadderWarnings(ladder, 'Safety net') : []),
    ...(perStockEnabled ? [...holdLadderWarnings(perStockLadder, 'Stock stops'), ...holdLadderWarnings(perStockOptionLadder, 'Option stops')] : []),
    ...(regimeEnabled ? redMarketWarnings(regimeDoubleRedGrossPct, regimeTrimToPct) : []),
    ...(ladderEnabled && regimeEnabled ? crossPolicyWarnings(regimeDoubleRedGrossPct, ladder) : []),
  ];

  // ── mutators ────────────────────────────────────────────────────────────────
  function toggleTab(i: number) {
    const keys = ['capsEnabled', 'ladderEnabled', 'perStockEnabled', 'regimeEnabled'] as const;
    setDraft((d) => ({ ...d, [keys[i]]: !enabledForTab[i] }));
  }

  function updateRung(i: number, patch: Partial<DrawdownStep>) {
    setDraft((d) => ({ ...d, ladder: ladder.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  }
  function addRung() {
    const last = ladder[ladder.length - 1];
    const next: DrawdownStep = last
      ? { drawdownPct: last.drawdownPct - 5, targetGrossPct: Math.max(0, last.targetGrossPct - 20) }
      : { drawdownPct: -10, targetGrossPct: 70 };
    setDraft((d) => ({ ...d, ladder: [...ladder, next] }));
  }
  function removeRung(i: number) {
    setDraft((d) => ({ ...d, ladder: ladder.filter((_, idx) => idx !== i) }));
  }

  const activeStockLadder = scope === 'options' ? perStockOptionLadder : perStockLadder;
  const stockKey = scope === 'options' ? 'perStockOptionLadder' : 'perStockLadder';
  function updateStockRung(i: number, patch: Partial<PerStockDrawdownStep>) {
    setDraft((d) => ({ ...d, [stockKey]: activeStockLadder.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  }
  function addStockRung() {
    const last = activeStockLadder[activeStockLadder.length - 1];
    const next: PerStockDrawdownStep = last
      ? { drawdownPct: last.drawdownPct - 5, holdFractionPct: Math.max(0, last.holdFractionPct - 25) }
      : { drawdownPct: -5, holdFractionPct: 75 };
    setDraft((d) => ({ ...d, [stockKey]: [...activeStockLadder, next] }));
  }
  function removeStockRung(i: number) {
    setDraft((d) => ({ ...d, [stockKey]: activeStockLadder.filter((_, idx) => idx !== i) }));
  }

  async function handleSave() {
    await save.mutateAsync({
      max_position_pct: maxPositionPct,
      max_option_position_pct: maxOptionPositionPct,
      max_sector_pct: maxSectorPct,
      max_gross_pct: maxGrossPct,
      account_equity: accountEquity,
      ladder,
      per_stock_ladder: perStockLadder,
      per_stock_option_ladder: perStockOptionLadder,
      drawdown_near_band_pp: drawdownNearBandPp,
      regime_trim_to_pct: regimeTrimToPct,
      regime_stop_pct: regimeStopPct,
      regime_doublered_gross_pct: regimeDoubleRedGrossPct,
      caps_enabled: capsEnabled,
      ladder_enabled: ladderEnabled,
      per_stock_enabled: perStockEnabled,
      regime_enabled: regimeEnabled,
    });
    setDraft({});
  }

  // ── ladder viz segments ───────────────────────────────────────────────────
  const ladderSegs: Seg[] = [
    { top: '100% invested', range: `down 0–${ladder[0] ? Math.abs(ladder[0].drawdownPct) : 0}%`, h: 64, ...COLORS[0] },
    ...ladder.map((r, i) => {
      const dd = Math.abs(r.drawdownPct);
      const nextDd = ladder[i + 1] ? Math.abs(ladder[i + 1].drawdownPct) : null;
      return {
        top: `${r.targetGrossPct}% invested`,
        range: `down ${dd}${nextDd != null ? `–${nextDd}%` : '%+'}`,
        h: Math.max(6, Math.round((r.targetGrossPct / 100) * 64)),
        ...rungColor(i + 1),
        onDrag: (pct: number) => {
          const hi = i === 0 ? 100 : ladder[i - 1].targetGrossPct;
          const lo = ladder[i + 1] ? ladder[i + 1].targetGrossPct : 0;
          updateRung(i, { targetGrossPct: Math.min(hi, Math.max(lo, pct)) });
        },
      };
    }),
  ];

  const stockSegs: Seg[] = [
    { top: 'keep 100%', range: `down 0–${activeStockLadder[0] ? Math.abs(activeStockLadder[0].drawdownPct) : 0}%`, h: 64, ...COLORS[0] },
    ...activeStockLadder.map((r, i) => {
      const dd = Math.abs(r.drawdownPct);
      const nextDd = activeStockLadder[i + 1] ? Math.abs(activeStockLadder[i + 1].drawdownPct) : null;
      return {
        top: r.holdFractionPct === 0 ? 'sold' : `keep ${r.holdFractionPct}%`,
        range: `down ${dd}${nextDd != null ? `–${nextDd}%` : '%+'}`,
        h: Math.max(6, Math.round((r.holdFractionPct / 100) * 64)),
        ...rungColor(i + 1),
        onDrag: (pct: number) => {
          const hi = i === 0 ? 100 : activeStockLadder[i - 1].holdFractionPct;
          const lo = activeStockLadder[i + 1] ? activeStockLadder[i + 1].holdFractionPct : 0;
          updateStockRung(i, { holdFractionPct: Math.min(hi, Math.max(lo, pct)) });
        },
      };
    }),
  ];

  const redSegs: Seg[] = [
    { top: '100% on', range: 'no red lights', h: 64, ...COLORS[0] },
    {
      top: `${regimeTrimToPct}% of each position`, range: 'one red light',
      h: Math.max(6, Math.round((regimeTrimToPct / 100) * 64)), ...COLORS[1],
      onDrag: (pct: number) => setDraft((d) => ({ ...d, regimeTrimToPct: Math.max(regimeDoubleRedGrossPct, pct) })),
    },
    {
      top: `${regimeDoubleRedGrossPct}% of account`, range: 'both red',
      h: Math.max(6, Math.round((regimeDoubleRedGrossPct / 100) * 64)), ...COLORS[2],
      onDrag: (pct: number) => setDraft((d) => ({ ...d, regimeDoubleRedGrossPct: Math.min(regimeTrimToPct, pct) })),
    },
  ];

  const equityFmt = money.format(equity);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.xl, padding: SPACE[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE[3], marginBottom: SPACE[1] }}>
        <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>Your risk guardrails</div>
        <Button variant="primary" dirty={dirty} disabled={!dirty || save.isPending} onClick={handleSave} style={{ padding: `${SPACE[1]}px ${SPACE[3]}px`, fontSize: FONT_SIZE.sm }}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginBottom: SPACE[3], lineHeight: 1.5 }}>
        Four guardrails, each one optional — switch off any that fights your strategy. Everything here is
        {' '}<b style={{ color: 'var(--t2)' }}>advisory</b>: you get flags and alerts; nothing ever places or blocks a trade.
      </div>

      {/* Tab selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: SPACE[1.5], marginBottom: SPACE[4] }}>
        {TABS.map((t, i) => {
          const active = i === tab;
          const enabled = enabledForTab[i];
          return (
            <button
              key={i}
              type="button"
              onClick={() => { setTab(i); setHelpOpen(false); }}
              style={{ textAlign: 'left', padding: `${SPACE[2.5]}px ${SPACE[3]}px`, borderRadius: RADIUS.lg, cursor: 'pointer', border: `1px solid ${active ? 'var(--acc)' : 'var(--border)'}`, background: active ? 'var(--s2)' : 'var(--surface)' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
                <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: RADIUS.full, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, border: `1px solid ${active ? 'var(--acc)' : 'var(--border)'}`, background: active ? 'var(--acc)' : 'var(--s2)', color: active ? 'var(--text-inverse)' : 'var(--t2)' }}>{i + 1}</span>
                <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: active ? 'var(--text)' : 'var(--t2)' }}>{t.title}</span>
                {!enabled && (
                  <span style={{ marginLeft: 'auto', padding: `1px ${SPACE[1.5]}px`, borderRadius: RADIUS.full, background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--t3)', fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase' }}>Off</span>
                )}
              </span>
              <span style={{ display: 'block', marginTop: SPACE[0.5], paddingLeft: 26, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', lineHeight: 1.4 }}>{t.caption}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 0 — Position size caps */}
      {tab === 0 && (
        <div>
          <ToggleBar on={capsEnabled} onToggle={() => toggleTab(0)} />
          <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginBottom: SPACE[3] }}>
            Caps on how much of your account — currently <b style={{ color: 'var(--text)' }}>{equityFmt}</b> — can sit in any one place. You'll see a flag on the Risk tab when a cap is crossed.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>
            <FormRow layout={rowLayout} label="Account equity">
              {config.ibkr_nlv != null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap' }}>
                  <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money.format(config.ibkr_nlv)}</span>
                  <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', flex: '1 1 auto', minWidth: 0 }}>Live balance from IBKR, incl. margin (updates each sync)</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap' }}>
                  <span style={prefixSlot}>$</span>
                  <TextInput type="number" min={0} placeholder="e.g. 50000" style={{ width: 120 }}
                    value={accountEquity}
                    onChange={(e) => setDraft((d) => ({ ...d, accountEquity: e.target.value === '' ? undefined : Number(e.target.value) }))} />
                  {config.is_placeholder && (
                    <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>default placeholder — set your real equity, or connect IBKR for a live figure</span>
                  )}
                </div>
              )}
            </FormRow>

            <NumRow layout={rowLayout} label="Any one stock" suffix="% of account" note="per underlying — shares and options combined" min={0} max={100}
              value={maxPositionPct} dollar={dPos(maxPositionPct)} onChange={(v) => setDraft((d) => ({ ...d, maxPositionPct: v }))} />
            <NumRow layout={rowLayout} label="…via options only" suffix="% of account" note="options are riskier, so this cap is tighter" min={0} max={100}
              value={maxOptionPositionPct} dollar={dPos(maxOptionPositionPct)} onChange={(v) => setDraft((d) => ({ ...d, maxOptionPositionPct: v }))} />
            <NumRow layout={rowLayout} label="Any one sector" suffix="% of account" note="all your names in one industry, together" min={0} max={100}
              value={maxSectorPct} dollar={dPos(maxSectorPct)} onChange={(v) => setDraft((d) => ({ ...d, maxSectorPct: v }))} />
            <NumRow layout={rowLayout} label="Everything combined" suffix="% of account" note="your total invested — over 100% means margin" min={0}
              value={maxGrossPct} dollar={dPos(maxGrossPct)} onChange={(v) => setDraft((d) => ({ ...d, maxGrossPct: v }))} />
          </div>
          <HelpToggle open={helpOpen} onToggle={() => setHelpOpen((o) => !o)}>
            <span><b style={glossaryTerm}>% of account</b> — measured against your live IBKR balance, so the dollar figures update on every sync.</span>
            <span><b style={glossaryTerm}>Sector</b> — a market industry group (e.g. all your semiconductor names counted together).</span>
            <span><b style={glossaryTerm}>Everything combined ("gross")</b> — the total size of all your positions added up. Over 100% means you're borrowing on margin.</span>
          </HelpToggle>
        </div>
      )}

      {/* Tab 1 — Account safety net */}
      {tab === 1 && (
        <div>
          <ToggleBar on={ladderEnabled} onToggle={() => toggleTab(1)} />
          <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginBottom: SPACE[3] }}>
            If your <b style={{ color: 'var(--text)' }}>whole account</b> falls from its high point, step down how much you have invested. You get an alert at each step — you decide whether to act; nothing is sold for you. It watches shares and options together.
          </div>
          <LadderViz segs={ladderSegs} caption={<>How much stays invested as your account drawdown deepens. <b style={{ color: 'var(--t2)' }}>Drag a bar</b> to set its level, or type below.</>} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2.5] }}>
            {ladder.map((r, i) => (
              <div key={i} style={rowCard}>
                <span style={stepPill}>Step {i + 1}</span>
                <span style={inlineText}>If my account is down</span>
                <TextInput type="number" min={0} max={100} style={smallInput} value={Math.abs(r.drawdownPct)}
                  onChange={(e) => updateRung(i, { drawdownPct: -Math.abs(Number(e.target.value)) })} />
                <span style={inlineText}>%</span>
                <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: 'var(--status-negative-text)', fontVariantNumeric: 'tabular-nums' }}>{dNeg(Math.abs(r.drawdownPct))}</span>
                <span style={inlineText}>→ cut invested to</span>
                <TextInput type="number" min={0} max={100} style={smallInput} value={r.targetGrossPct}
                  onChange={(e) => updateRung(i, { targetGrossPct: Number(e.target.value) })} />
                <span style={inlineText}>% of account</span>
                <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{dPos(r.targetGrossPct)}</span>
                <button type="button" onClick={() => removeRung(i)} aria-label={`Remove step ${i + 1}`} style={removeBtn}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addRung} style={addStepBtn}>+ Add a deeper step</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap', marginTop: SPACE[3.5] }}>
            <span style={inlineText}>Give me an <b style={{ color: 'var(--status-warning-text)' }}>amber heads-up</b> when I'm within</span>
            <TextInput type="number" min={0} style={smallInput} value={drawdownNearBandPp}
              onChange={(e) => setDraft((d) => ({ ...d, drawdownNearBandPp: Number(e.target.value) }))} />
            <span style={inlineText}>points of the next step (applies to this ladder and the per-stock one).</span>
          </div>
          <HelpToggle open={helpOpen} onToggle={() => setHelpOpen((o) => !o)}>
            <span><b style={glossaryTerm}>Down / drawdown</b> — how far your account sits below its highest value, adjusted for deposits and withdrawals so adding cash never looks like a loss.</span>
            <span><b style={glossaryTerm}>Invested</b> — the combined size of all positions ("gross exposure").</span>
            <span>Steps only step down: each deeper step should cut more than the one before it.</span>
          </HelpToggle>
        </div>
      )}

      {/* Tab 2 — Per-position stops */}
      {tab === 2 && (
        <div>
          <ToggleBar on={perStockEnabled} onToggle={() => toggleTab(2)} />
          <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginBottom: SPACE[3] }}>
            The same idea, one position at a time: based on how far it has fallen from <b style={{ color: 'var(--text)' }}>your entry</b>, keep at most this share of the position. Stocks and options each have their <b style={{ color: 'var(--text)' }}>own ladder</b> — options move faster, so that one cuts sooner. Advisory only.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap', marginBottom: SPACE[1.5] }}>
            <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>Editing the ladder for:</span>
            {(['stocks', 'options'] as const).map((sc) => {
              const on = scope === sc;
              return (
                <button key={sc} type="button" onClick={() => setScope(sc)}
                  style={{ padding: `${SPACE[1]}px ${SPACE[3]}px`, borderRadius: RADIUS.full, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, cursor: 'pointer', border: `1px solid ${on ? 'var(--acc)' : 'var(--border)'}`, background: on ? 'var(--s2)' : 'var(--surface)', color: on ? 'var(--text)' : 'var(--t2)' }}>
                  {sc === 'stocks' ? 'Stocks' : 'Options'}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginBottom: SPACE[3] }}>
            {scope === 'stocks'
              ? 'Share positions, measured from your average entry price.'
              : 'Option positions, measured from the premium you paid — options move faster, so this ladder starts deeper but cuts sooner.'}
          </div>
          <LadderViz segs={stockSegs} caption={<>How much of a position you keep as that {scope === 'options' ? 'option' : 'stock'} falls from your entry. <b style={{ color: 'var(--t2)' }}>Drag a bar</b> to set its level, or type below.</>} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2.5] }}>
            {activeStockLadder.map((r, i) => (
              <div key={i} style={rowCard}>
                <span style={stepPill}>Step {i + 1}</span>
                <span style={inlineText}>If {scope === 'options' ? 'an option' : 'a stock'} is down</span>
                <TextInput type="number" min={0} max={100} style={smallInput} value={Math.abs(r.drawdownPct)}
                  onChange={(e) => updateStockRung(i, { drawdownPct: -Math.abs(Number(e.target.value)) })} />
                <span style={inlineText}>% from my entry → keep at most</span>
                <TextInput type="number" min={0} max={100} style={smallInput} value={r.holdFractionPct}
                  onChange={(e) => updateStockRung(i, { holdFractionPct: Number(e.target.value) })} />
                <span style={inlineText}>% of the position</span>
                {r.holdFractionPct === 0 && <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: 'var(--status-negative-text)' }}>= sell it all</span>}
                <button type="button" onClick={() => removeStockRung(i)} aria-label={`Remove step ${i + 1}`} style={removeBtn}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addStockRung} style={addStepBtn}>+ Add a deeper step</button>
          <HelpToggle open={helpOpen} onToggle={() => setHelpOpen((o) => !o)}>
            <span><b style={glossaryTerm}>From my entry</b> — measured against the price you paid, not the stock's all-time high.</span>
            <span><b style={glossaryTerm}>Keep at most X%</b> — the share of the position you'd still hold; <b style={glossaryTerm}>0% means sell it all</b>.</span>
            <span>This ladder is separate from the account-wide safety net — one watches each stock, the other watches your whole account.</span>
          </HelpToggle>
        </div>
      )}

      {/* Tab 3 — Red-market playbook */}
      {tab === 3 && (
        <div>
          <ToggleBar on={regimeEnabled} onToggle={() => toggleTab(3)} />
          <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginBottom: SPACE[3] }}>
            The <b style={{ color: 'var(--text)' }}>Regime light</b> (on the Macro page) turns RED when the market's trend or volatility breaks down. Write your plan for those days now, so you're not deciding in a panic. Advisory only — shown next to the light.
          </div>
          <LadderViz segs={redSegs} caption={<>How much stays on as the regime light worsens. <b style={{ color: 'var(--t2)' }}>Drag a bar</b> to set its level, or type below.</>} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: SPACE[2.5] }}>
            <div style={{ background: 'var(--surface-inset)', border: '1px solid var(--status-warning-border)', borderRadius: RADIUS.lg, padding: SPACE[3] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], marginBottom: SPACE[2] }}>
                <span style={{ width: 10, height: 10, borderRadius: RADIUS.full, background: 'var(--status-negative-text)', flexShrink: 0 }} />
                <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color: 'var(--t2)' }}>One red light — trend OR volatility</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap', marginBottom: SPACE[2] }}>
                <span style={inlineText}>Trim every position to</span>
                <TextInput type="number" min={0} max={100} style={smallInput} value={regimeTrimToPct}
                  onChange={(e) => setDraft((d) => ({ ...d, regimeTrimToPct: Number(e.target.value) }))} />
                <span style={inlineText}>% of its current size</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap' }}>
                <span style={inlineText}>…or, instead, tighten stop-losses to</span>
                <TextInput type="number" min={0} max={100} style={smallInput} value={regimeStopPct}
                  onChange={(e) => setDraft((d) => ({ ...d, regimeStopPct: Number(e.target.value) }))} />
                <span style={inlineText}>% below price</span>
              </div>
            </div>
            <div style={{ background: 'var(--surface-inset)', border: '1px solid var(--status-negative-border)', borderRadius: RADIUS.lg, padding: SPACE[3] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], marginBottom: SPACE[2] }}>
                <span style={{ width: 10, height: 10, borderRadius: RADIUS.full, background: 'var(--status-negative-text)', flexShrink: 0 }} />
                <span style={{ width: 10, height: 10, borderRadius: RADIUS.full, background: 'var(--status-negative-text)', flexShrink: 0, marginLeft: -2 }} />
                <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color: 'var(--t2)' }}>Both red — trend AND volatility</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap' }}>
                <span style={inlineText}>Cut total invested to</span>
                <TextInput type="number" min={0} max={100} style={smallInput} value={regimeDoubleRedGrossPct}
                  onChange={(e) => setDraft((d) => ({ ...d, regimeDoubleRedGrossPct: Number(e.target.value) }))} />
                <span style={inlineText}>% of account</span>
                <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{dPos(regimeDoubleRedGrossPct)}</span>
              </div>
            </div>
          </div>
          <HelpToggle open={helpOpen} onToggle={() => setHelpOpen((o) => !o)}>
            <span><b style={glossaryTerm}>Regime light</b> — STW's daily market health check, on the Macro page. It watches two things: <b style={glossaryTerm}>trend</b> (is the market still in an uptrend?) and <b style={glossaryTerm}>volatility</b> (how violently prices are swinging).</span>
            <span>One RED is caution; both RED together is the serious case — that's why its cut is deeper.</span>
          </HelpToggle>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: SPACE[3.5] }}>
          <AlertStrip severity="warning">
            <ul style={{ margin: 0, paddingLeft: SPACE[4], display: 'flex', flexDirection: 'column', gap: SPACE[0.5] }}>
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </AlertStrip>
        </div>
      )}
    </div>
  );
}
