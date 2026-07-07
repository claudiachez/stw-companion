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
function thresholdWarnings(maxPositionPct: number, maxSectorPct: number, maxGrossPct: number): string[] {
  const warnings: string[] = [];
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
    maxPositionPct?: number; maxSectorPct?: number; maxGrossPct?: number;
    accountEquity?: number; ladder?: DrawdownStep[];
  }>({});

  const maxPositionPct = draft.maxPositionPct ?? config.max_position_pct;
  const maxSectorPct = draft.maxSectorPct ?? config.max_sector_pct;
  const maxGrossPct = draft.maxGrossPct ?? config.max_gross_pct;
  const accountEquity = draft.accountEquity ?? config.account_equity;
  const ladder = draft.ladder ?? config.ladder;
  const dirty = Object.keys(draft).length > 0;
  const warnings = [...thresholdWarnings(maxPositionPct, maxSectorPct, maxGrossPct), ...ladderWarnings(ladder)];

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
      max_sector_pct: maxSectorPct,
      max_gross_pct: maxGrossPct,
      account_equity: accountEquity,
      ladder,
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
        <FormRow layout={rowLayout} label="Account equity" prefix="$" hint={
          config.is_placeholder
            ? 'Default placeholder — set your real account equity for accurate limits.'
            : config.equity_peak && config.equity_peak > accountEquity
              ? `Peak: $${config.equity_peak.toLocaleString()} · ${(((accountEquity - config.equity_peak) / config.equity_peak) * 100).toFixed(1)}% off peak`
              : 'At peak.'
        }>
          <TextInput type="number" min={0} placeholder="e.g. 50000"
            value={accountEquity}
            onChange={(e) => setDraft((d) => ({ ...d, accountEquity: e.target.value === '' ? undefined : Number(e.target.value) }))} />
        </FormRow>

        <FormRow layout={rowLayout} label="Max position" suffix="%" hint="of book, per underlying">
          <TextInput type="number" min={0} max={100}
            value={maxPositionPct}
            onChange={(e) => setDraft((d) => ({ ...d, maxPositionPct: Number(e.target.value) }))} />
        </FormRow>

        <FormRow layout={rowLayout} label="Max sector" suffix="%" hint="of book, per sector">
          <TextInput type="number" min={0} max={100}
            value={maxSectorPct}
            onChange={(e) => setDraft((d) => ({ ...d, maxSectorPct: Number(e.target.value) }))} />
        </FormRow>

        <FormRow layout={rowLayout} label="Max gross" suffix="%" hint="of book, whole book">
          <TextInput type="number" min={0}
            value={maxGrossPct}
            onChange={(e) => setDraft((d) => ({ ...d, maxGrossPct: Number(e.target.value) }))} />
        </FormRow>

        <div>
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACE[2] }}>
            Drawdown ladder
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2.5] }}>
            {ladder.map((rung, i) => (
              <FormRow key={i} layout={rowLayout} label={rungLabel(i)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flexWrap: 'wrap' }}>
                  <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>At</span>
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
