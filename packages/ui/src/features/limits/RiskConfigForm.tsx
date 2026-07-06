import { useState } from 'react';
import type { RiskConfigRow } from './api';
import { useSaveRiskConfig } from './useRiskConfig';

// Single-card, single-Save editable thresholds — same pattern as apps/admin's
// ConfigPage.tsx (Section + one Save covering every field), just per-user
// instead of per-app-global. Ladder is fixed at two steps per the spec
// (plans/integrity-guardrails.md Item 2) — no add/remove UI.

const rowLabel = 'text-t2 text-xs w-32 shrink-0';
const rowInput = 'bg-s2 border border-border rounded px-2 py-1.5 text-sm text-text w-20 focus:outline-none focus:border-acc';

export function RiskConfigForm({ userId, config }: { userId: string; config: RiskConfigRow }) {
  const save = useSaveRiskConfig(userId);
  const [draft, setDraft] = useState<{
    maxPositionPct?: number; maxSectorPct?: number; maxGrossPct?: number;
    ladder0Drawdown?: number; ladder0Target?: number; ladder1Drawdown?: number; ladder1Target?: number;
  }>({});

  const step0 = config.ladder[0] ?? { drawdownPct: -10, targetGrossPct: 70 };
  const step1 = config.ladder[1] ?? { drawdownPct: -15, targetGrossPct: 50 };
  const dirty = Object.keys(draft).length > 0;

  async function handleSave() {
    await save.mutateAsync({
      max_position_pct: draft.maxPositionPct ?? config.max_position_pct,
      max_sector_pct: draft.maxSectorPct ?? config.max_sector_pct,
      max_gross_pct: draft.maxGrossPct ?? config.max_gross_pct,
      ladder: [
        { drawdownPct: draft.ladder0Drawdown ?? step0.drawdownPct, targetGrossPct: draft.ladder0Target ?? step0.targetGrossPct },
        { drawdownPct: draft.ladder1Drawdown ?? step1.drawdownPct, targetGrossPct: draft.ladder1Target ?? step1.targetGrossPct },
      ],
    });
    setDraft({});
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-text font-semibold text-sm">Your thresholds</div>
        <button
          onClick={handleSave}
          disabled={!dirty || save.isPending}
          className="shrink-0 ml-4 px-3 py-1.5 rounded text-xs font-semibold bg-acc text-white disabled:opacity-40"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="text-t3 text-xs mb-4">
        {config.is_placeholder
          ? 'These are starter defaults — set your own before trusting the flags below.'
          : 'Flags only. Nothing here places or blocks a trade.'}
      </div>
      <div className="flex flex-col divide-y divide-bsub">
        <div className="flex items-center gap-3 py-3">
          <span className={rowLabel}>Max position</span>
          <input type="number" min={0} max={100}
            value={draft.maxPositionPct ?? config.max_position_pct}
            onChange={(e) => setDraft((d) => ({ ...d, maxPositionPct: Number(e.target.value) }))}
            className={rowInput} />
          <span className="text-t2 text-sm">% of book, per underlying</span>
        </div>
        <div className="flex items-center gap-3 py-3">
          <span className={rowLabel}>Max sector</span>
          <input type="number" min={0} max={100}
            value={draft.maxSectorPct ?? config.max_sector_pct}
            onChange={(e) => setDraft((d) => ({ ...d, maxSectorPct: Number(e.target.value) }))}
            className={rowInput} />
          <span className="text-t2 text-sm">% of book, per sector</span>
        </div>
        <div className="flex items-center gap-3 py-3">
          <span className={rowLabel}>Max gross</span>
          <input type="number" min={0}
            value={draft.maxGrossPct ?? config.max_gross_pct}
            onChange={(e) => setDraft((d) => ({ ...d, maxGrossPct: Number(e.target.value) }))}
            className={rowInput} />
          <span className="text-t2 text-sm">% of book, whole book</span>
        </div>
        <div className="flex items-center gap-3 py-3 flex-wrap">
          <span className={rowLabel}>Drawdown ladder</span>
          <span className="text-t2 text-sm">At</span>
          <input type="number" max={0}
            value={draft.ladder0Drawdown ?? step0.drawdownPct}
            onChange={(e) => setDraft((d) => ({ ...d, ladder0Drawdown: Number(e.target.value) }))}
            className={`${rowInput} w-16`} />
          <span className="text-t2 text-sm">% drawdown, target</span>
          <input type="number" min={0} max={100}
            value={draft.ladder0Target ?? step0.targetGrossPct}
            onChange={(e) => setDraft((d) => ({ ...d, ladder0Target: Number(e.target.value) }))}
            className={`${rowInput} w-16`} />
          <span className="text-t2 text-sm">% gross</span>
        </div>
        <div className="flex items-center gap-3 py-3 flex-wrap">
          <span className={rowLabel} />
          <span className="text-t2 text-sm">At</span>
          <input type="number" max={0}
            value={draft.ladder1Drawdown ?? step1.drawdownPct}
            onChange={(e) => setDraft((d) => ({ ...d, ladder1Drawdown: Number(e.target.value) }))}
            className={`${rowInput} w-16`} />
          <span className="text-t2 text-sm">% drawdown, target</span>
          <input type="number" min={0} max={100}
            value={draft.ladder1Target ?? step1.targetGrossPct}
            onChange={(e) => setDraft((d) => ({ ...d, ladder1Target: Number(e.target.value) }))}
            className={`${rowInput} w-16`} />
          <span className="text-t2 text-sm">% gross</span>
        </div>
      </div>
    </div>
  );
}
