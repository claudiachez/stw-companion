import { useState } from 'react';
import { FONT_SIZE, FONT_WEIGHT, RADIUS, SPACE, type DrawdownStep } from '@stw/shared';
import { Button } from '../../primitives/Button';
import { FormRow, type FormRowProps } from '../../primitives/FormRow';
import { TextInput } from '../../primitives/TextInput';
import { AlertStrip } from '../../primitives/AlertStrip';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { RiskConfigRow } from './api';
import { useSaveRiskConfig } from './useRiskConfig';

// Single-card, single-Save editable thresholds — same pattern as apps/admin's
// ConfigPage.tsx (Section + one Save covering every field), just per-user
// instead of per-app-global. The ladder is a dynamic array (host feedback,
// 2026-07-08 Settings redesign) — the two seeded rungs were never a hard
// limit, just DEFAULT_RISK_CONFIG's starting shape.

const smallInput = { width: 64 };

// Fixed-width, right-aligned prefix slot rendered on EVERY row (empty or filled) so the
// input after it always starts at the same x — whether the row leads with "$", "At", or
// nothing. Same convention as ConfigPage.tsx's `rowPrefix`; keeps one clean left edge.
const prefixSlot: React.CSSProperties = { width: 22, flexShrink: 0, textAlign: 'right', fontSize: FONT_SIZE.sm, color: 'var(--t2)' };

/** Compact numeric row: label, then a narrow input with the unit + descriptor inline
 * to its right — the same shape as the drawdown-ladder rows, so every field lines up.
 * A leading `prefix` (e.g. "$") sits in the fixed-width slot; empty keeps the input aligned. */
function NumRow({ label, value, onChange, suffix, note, prefix, min, max, layout }: {
  label: string; value: number; onChange: (v: number) => void;
  suffix: string; note?: string; prefix?: string; min?: number; max?: number; layout: FormRowProps['layout'];
}) {
  return (
    <FormRow layout={layout} label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap' }}>
        <span style={prefixSlot}>{prefix ?? ''}</span>
        <TextInput type="number" min={min} max={max} style={smallInput}
          value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>{suffix}{note ? ` ${note}` : ''}</span>
      </div>
    </FormRow>
  );
}

function rungLabel(i: number): string {
  return `Rung ${i + 1}`;
}

/** Ladder rungs should get strictly deeper (more negative) and target strictly
 * lower-or-equal gross exposure as you go down the list — a glide path that
 * gets MORE conservative the further underwater you are, never less. */
function ladderWarnings(ladder: DrawdownStep[]): string[] {
  const warnings: string[] = [];
  for (let i = 1; i < ladder.length; i++) {
    const prev = ladder[i - 1];
    const cur = ladder[i];
    if (Math.abs(cur.drawdownPct) <= Math.abs(prev.drawdownPct)) {
      warnings.push(`${rungLabel(i)}'s drawdown (${Math.abs(cur.drawdownPct)}%) should be deeper than ${rungLabel(i - 1)}'s (${Math.abs(prev.drawdownPct)}%).`);
    } else if (cur.targetGrossPct > prev.targetGrossPct) {
      warnings.push(`${rungLabel(i)} targets a higher gross exposure (${cur.targetGrossPct}%) than the shallower ${rungLabel(i - 1)} (${prev.targetGrossPct}%) — deeper drawdowns should target lower exposure.`);
    }
  }
  return warnings;
}

/** A single position can't out-concentrate its own sector, and a single sector
 * can't out-concentrate the whole book. */
function thresholdWarnings(maxPositionPct: number, maxOptionPositionPct: number, maxSectorPct: number, maxGrossPct: number): string[] {
  const warnings: string[] = [];
  if (maxOptionPositionPct > maxPositionPct) warnings.push(`Max option position (${maxOptionPositionPct}%) exceeds max position (${maxPositionPct}%) — the options cap is meant to be tighter, not looser, than the overall single-name cap.`);
  if (maxPositionPct > maxSectorPct) warnings.push(`Max position (${maxPositionPct}%) exceeds max sector (${maxSectorPct}%) — a single position can't be more concentrated than its own sector.`);
  if (maxSectorPct > maxGrossPct) warnings.push(`Max sector (${maxSectorPct}%) exceeds max gross (${maxGrossPct}%) — a single sector can't exceed the whole book's limit.`);
  return warnings;
}

export function RiskConfigForm({ userId, config }: { userId: string; config: RiskConfigRow }) {
  const save = useSaveRiskConfig(userId);
  // The ladder rows in particular pack 2 inputs + connecting text into one line — FormRow's
  // fixed-width label column plus that content reliably overflows a ≤390px viewport, and
  // horizontal's flex-wrap then centers the label mid-way through the wrapped content
  // instead of above it. Stacked (label above, full-width row below) avoids that entirely.
  const isMobile = useIsMobile();
  const rowLayout: FormRowProps['layout'] = isMobile ? 'stacked' : 'horizontal';
  const [draft, setDraft] = useState<{
    maxPositionPct?: number; maxOptionPositionPct?: number; maxSectorPct?: number; maxGrossPct?: number;
    accountEquity?: number; ladder?: DrawdownStep[];
    regimeTrimToPct?: number; regimeStopPct?: number; regimeDoubleRedGrossPct?: number;
  }>({});

  const maxPositionPct = draft.maxPositionPct ?? config.max_position_pct;
  const maxOptionPositionPct = draft.maxOptionPositionPct ?? config.max_option_position_pct;
  const maxSectorPct = draft.maxSectorPct ?? config.max_sector_pct;
  const maxGrossPct = draft.maxGrossPct ?? config.max_gross_pct;
  const accountEquity = draft.accountEquity ?? config.account_equity;
  const ladder = draft.ladder ?? config.ladder;
  const regimeTrimToPct = draft.regimeTrimToPct ?? config.regime_trim_to_pct;
  const regimeStopPct = draft.regimeStopPct ?? config.regime_stop_pct;
  const regimeDoubleRedGrossPct = draft.regimeDoubleRedGrossPct ?? config.regime_doublered_gross_pct;
  const dirty = Object.keys(draft).length > 0;
  const warnings = [...thresholdWarnings(maxPositionPct, maxOptionPositionPct, maxSectorPct, maxGrossPct), ...ladderWarnings(ladder)];

  function updateRung(i: number, patch: Partial<DrawdownStep>) {
    setDraft((d) => ({ ...d, ladder: ladder.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  }
  function addRung() {
    const last = ladder[ladder.length - 1];
    const next: DrawdownStep = last
      ? { drawdownPct: last.drawdownPct - 5, targetGrossPct: Math.max(0, last.targetGrossPct - 10) }
      : { drawdownPct: -10, targetGrossPct: 70 };
    setDraft((d) => ({ ...d, ladder: [...ladder, next] }));
  }
  function removeRung(i: number) {
    setDraft((d) => ({ ...d, ladder: ladder.filter((_, idx) => idx !== i) }));
  }

  async function handleSave() {
    await save.mutateAsync({
      max_position_pct: maxPositionPct,
      max_option_position_pct: maxOptionPositionPct,
      max_sector_pct: maxSectorPct,
      max_gross_pct: maxGrossPct,
      account_equity: accountEquity,
      ladder,
      regime_trim_to_pct: regimeTrimToPct,
      regime_stop_pct: regimeStopPct,
      regime_doublered_gross_pct: regimeDoubleRedGrossPct,
    });
    setDraft({});
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.xl, padding: SPACE[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE[1] }}>
        <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>Your thresholds</div>
        <Button variant="primary" dirty={dirty} disabled={!dirty || save.isPending} onClick={handleSave} style={{ padding: `${SPACE[1]}px ${SPACE[3]}px`, fontSize: FONT_SIZE.sm }}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginBottom: SPACE[3] }}>
        {config.is_placeholder
          ? 'These are starter defaults — set your own before trusting the flags below.'
          : 'Flags only. Nothing here places or blocks a trade.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>
        <FormRow layout={rowLayout} label="Account equity">
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap' }}>
            <span style={prefixSlot}>$</span>
            <TextInput type="number" min={0} placeholder="e.g. 50000" style={{ width: 120 }}
              value={accountEquity}
              onChange={(e) => setDraft((d) => ({ ...d, accountEquity: e.target.value === '' ? undefined : Number(e.target.value) }))} />
            {config.is_placeholder && (
              <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>default placeholder — set your real account equity</span>
            )}
          </div>
        </FormRow>

        <NumRow layout={rowLayout} label="Max position" suffix="%" note="of book, per underlying" min={0} max={100}
          value={maxPositionPct} onChange={(v) => setDraft((d) => ({ ...d, maxPositionPct: v }))} />

        <NumRow layout={rowLayout} label="Max option position" suffix="%" note="of book, per underlying — options only (usually tighter)" min={0} max={100}
          value={maxOptionPositionPct} onChange={(v) => setDraft((d) => ({ ...d, maxOptionPositionPct: v }))} />

        <NumRow layout={rowLayout} label="Max sector" suffix="%" note="of book, per sector" min={0} max={100}
          value={maxSectorPct} onChange={(v) => setDraft((d) => ({ ...d, maxSectorPct: v }))} />

        <NumRow layout={rowLayout} label="Max gross" suffix="%" note="of book, whole book" min={0}
          value={maxGrossPct} onChange={(v) => setDraft((d) => ({ ...d, maxGrossPct: v }))} />

        <div>
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACE[2] }}>
            Drawdown ladder
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2.5] }}>
            {ladder.map((rung, i) => (
              <FormRow key={i} layout={rowLayout} label={rungLabel(i)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap' }}>
                  <span style={prefixSlot}>At</span>
                  <TextInput type="number" min={0} max={100} style={smallInput}
                    value={Math.abs(rung.drawdownPct)}
                    onChange={(e) => updateRung(i, { drawdownPct: -Math.abs(Number(e.target.value)) })} />
                  <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>% drawdown → target</span>
                  <TextInput type="number" min={0} max={100} style={smallInput}
                    value={rung.targetGrossPct}
                    onChange={(e) => updateRung(i, { targetGrossPct: Number(e.target.value) })} />
                  <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>% gross</span>
                  <button
                    type="button"
                    onClick={() => removeRung(i)}
                    aria-label={`Remove ${rungLabel(i)}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: FONT_SIZE.sm, padding: `0 ${SPACE[1]}px`, marginLeft: 'auto' }}
                  >
                    ✕
                  </button>
                </div>
              </FormRow>
            ))}
          </div>
          <button
            type="button"
            onClick={addRung}
            style={{
              marginTop: SPACE[2], background: 'none', border: '1px dashed var(--border)', borderRadius: RADIUS.md,
              padding: `${SPACE[1]}px ${SPACE[2.5]}px`, fontSize: FONT_SIZE.sm, color: 'var(--t2)', cursor: 'pointer',
            }}
          >
            + Add rung
          </button>
        </div>

        <div>
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACE[2] }}>
            Regime de-risking rule (advisory)
          </div>
          <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', marginBottom: SPACE[2.5] }}>
            Your own playbook to apply when the market regime turns RED — shown on the Regime light. Advisory only; nothing here places or blocks a trade.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>
            <NumRow layout={rowLayout} label="Single-RED: trim positions to" suffix="%" note="of current size, when trend OR volatility is RED" min={0} max={100}
              value={regimeTrimToPct} onChange={(v) => setDraft((d) => ({ ...d, regimeTrimToPct: v }))} />
            <NumRow layout={rowLayout} label="…or tighten stops to" suffix="%" note="the alternative single-RED action" min={0} max={100}
              value={regimeStopPct} onChange={(v) => setDraft((d) => ({ ...d, regimeStopPct: v }))} />
            <NumRow layout={rowLayout} label="Double-RED: reduce gross to" suffix="%" note="when both trend AND volatility are RED" min={0} max={100}
              value={regimeDoubleRedGrossPct} onChange={(v) => setDraft((d) => ({ ...d, regimeDoubleRedGrossPct: v }))} />
          </div>
        </div>

        {warnings.length > 0 && (
          <AlertStrip severity="warning">
            <ul style={{ margin: 0, paddingLeft: SPACE[4], display: 'flex', flexDirection: 'column', gap: SPACE[0.5] }}>
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </AlertStrip>
        )}
      </div>
    </div>
  );
}
