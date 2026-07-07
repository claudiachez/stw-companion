import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppConfig, AlertStrip } from '@stw/ui';
import { supabase } from '../../lib/supabase';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Config page (Phase 4, Part A — see plans/phase4_admin_manage.md). Edits app_config
// directly; admin-write RLS (JWT email = cc@claudiachez.com) is the actual gate, this
// page is just the UI. Reads go through the shared `useAppConfig` hook (@stw/ui) since
// the split defaults may eventually be read by apps/web too; the write path stays
// admin-local, per the plan's layer split.
//
// Settings are grouped into one card per related concern (Sizing Defaults / Capital
// Allocation / Live Trading), each with ONE Save button covering every field in that
// card — not one Save per field. Rows are fully controlled from the section's own draft
// state (no per-row local state), so a section's Save button simply clears its draft
// object and the fields fall back to the freshly-refetched stored values.

function Section({ title, hint, dirty, saving, onSave, children }: {
  title: React.ReactNode;
  hint: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-text font-semibold text-sm">{title}</div>
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className="shrink-0 ml-4 px-3 py-1.5 rounded text-xs font-semibold bg-acc text-white disabled:opacity-40 transition-opacity"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="text-t3 text-xs mb-4">{hint}</div>
      <div className="flex flex-col divide-y divide-bsub">{children}</div>
    </div>
  );
}

// A row's label gets a fixed width and its optional prefix ("$") gets a fixed-width slot
// EVEN WHEN UNUSED, so every input in a section starts at the same x position regardless
// of which rows have a prefix.
const rowLabel = 'text-t2 text-xs w-36 shrink-0';
const rowPrefix = 'text-t2 text-sm w-4 shrink-0 text-right';
const rowInput = 'bg-s2 border border-border rounded px-2 py-1.5 text-sm text-text focus:outline-none focus:border-acc';

// One paired-ratio row (e.g. "Equity 90 : 10 Options") inside a Section — fully
// controlled: `draftPct` (0-100) is undefined until the admin edits this row, in which
// case the Section's own draft state owns the value until Save (or a discard) clears it.
function RatioRow({
  label, storedValue, draftPct, leftLabel, rightLabel, onChange,
}: {
  label: string;
  storedValue: number | undefined;
  draftPct: number | undefined;
  leftLabel: string;
  rightLabel: string;
  onChange: (pct: number) => void;
}) {
  const displayPct = draftPct ?? Math.round((storedValue ?? 0) * 100);
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className={rowLabel}>{label}</span>
      <span className={rowPrefix} />
      <input
        type="number"
        min={0}
        max={100}
        value={displayPct}
        onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
        className={`w-20 ${rowInput}`}
      />
      <span className="text-t2 text-sm">%</span>
      <span className="text-t2 text-sm font-mono ml-2">
        {leftLabel} {displayPct} : {100 - displayPct} {rightLabel}
      </span>
    </div>
  );
}

// One single-number row (dollar amount or a lone %) inside a Section — same controlled
// pattern as RatioRow.
function NumberRow({
  label, storedValue, draftValue, prefix, suffix, step, onChange,
}: {
  label: string;
  storedValue: number | undefined;
  draftValue: number | undefined;
  prefix?: string;
  suffix?: string;
  step?: number;
  onChange: (value: number) => void;
}) {
  const displayVal = draftValue ?? storedValue ?? 0;
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className={rowLabel}>{label}</span>
      <span className={rowPrefix}>{prefix ?? ''}</span>
      <input
        type="number"
        min={0}
        step={step ?? 1}
        value={displayVal}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className={`w-28 ${rowInput}`}
      />
      {suffix && <span className="text-t2 text-sm">{suffix}</span>}
    </div>
  );
}

interface SizingDrafts { equity?: number; shortLong?: number }
interface CapitalDrafts { total?: number; shares?: number; options?: number }

export function ConfigPage() {
  const { config, ibkrLiveTradingEnabled } = useAppConfig();
  const qc = useQueryClient();

  const saveMany = useMutation({
    mutationFn: async (entries: [string, number][]) => {
      await Promise.all(entries.map(async ([key, value]) => {
        const { error } = await supabase.from('app_config').update({ value }).eq('key', key);
        if (error) throw error;
      }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_config'] }),
  });

  const [sizingDrafts, setSizingDrafts] = useState<SizingDrafts>({});
  const [capitalDrafts, setCapitalDrafts] = useState<CapitalDrafts>({});
  const [savingSection, setSavingSection] = useState<'sizing' | 'capital' | 'ibkr' | null>(null);

  async function saveSizing() {
    const entries: [string, number][] = [];
    if (sizingDrafts.equity !== undefined) entries.push(['equity_options_default', sizingDrafts.equity / 100]);
    if (sizingDrafts.shortLong !== undefined) entries.push(['options_short_long_default', sizingDrafts.shortLong / 100]);
    if (!entries.length) return;
    setSavingSection('sizing');
    try { await saveMany.mutateAsync(entries); setSizingDrafts({}); } finally { setSavingSection(null); }
  }

  async function saveCapital() {
    const entries: [string, number][] = [];
    if (capitalDrafts.total !== undefined) entries.push(['total_capital', capitalDrafts.total]);
    if (capitalDrafts.shares !== undefined) entries.push(['default_shares_deploy_pct', capitalDrafts.shares / 100]);
    if (capitalDrafts.options !== undefined) entries.push(['default_options_deploy_pct', capitalDrafts.options / 100]);
    if (!entries.length) return;
    setSavingSection('capital');
    try { await saveMany.mutateAsync(entries); setCapitalDrafts({}); } finally { setSavingSection(null); }
  }

  async function toggleIbkr() {
    setSavingSection('ibkr');
    try { await saveMany.mutateAsync([['ibkr_live_trading_enabled', ibkrLiveTradingEnabled ? 0 : 1]]); }
    finally { setSavingSection(null); }
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {/* No page title — the active nav tab is context (matches Picks/Signals/Users). */}
        {saveMany.isError && (
          <AlertStrip severity="negative">Save failed: {errMsg(saveMany.error)}</AlertStrip>
        )}

        <Section
          title="Sizing defaults"
          hint="Default sizing when a position's lots aren't specified per-leg. Defaults apply forward — past diary lots keep their weights; a position can override Equity:Options via its own field in the position editor."
          dirty={Object.keys(sizingDrafts).length > 0}
          saving={savingSection === 'sizing'}
          onSave={saveSizing}
        >
          <RatioRow
            label="Equity : Options"
            storedValue={config.equity_options_default}
            draftPct={sizingDrafts.equity}
            leftLabel="Equity"
            rightLabel="Options"
            onChange={(pct) => setSizingDrafts((d) => ({ ...d, equity: pct }))}
          />
          <RatioRow
            label="Short : Long"
            storedValue={config.options_short_long_default}
            draftPct={sizingDrafts.shortLong}
            leftLabel="Short"
            rightLabel="Long"
            onChange={(pct) => setSizingDrafts((d) => ({ ...d, shortLong: pct }))}
          />
        </Section>

        <Section
          title={<>Capital allocation <span className="text-t3 text-[10px] font-semibold uppercase tracking-wide align-middle ml-1">Admin only</span></>}
          hint="Powers the quantity suggestion in the IBKR order modal (Transaction History → Open/Close via IBKR) — a starting point only, still fully adjustable per-order. Never read by apps/web."
          dirty={Object.keys(capitalDrafts).length > 0}
          saving={savingSection === 'capital'}
          onSave={saveCapital}
        >
          <NumberRow
            label="Total capital"
            storedValue={config.total_capital}
            draftValue={capitalDrafts.total}
            prefix="$"
            step={1000}
            onChange={(value) => setCapitalDrafts((d) => ({ ...d, total: value }))}
          />
          <NumberRow
            label="Shares deploy %"
            storedValue={config.default_shares_deploy_pct !== undefined ? config.default_shares_deploy_pct * 100 : undefined}
            draftValue={capitalDrafts.shares}
            suffix="%"
            step={0.5}
            onChange={(value) => setCapitalDrafts((d) => ({ ...d, shares: value }))}
          />
          <NumberRow
            label="Options deploy %"
            storedValue={config.default_options_deploy_pct !== undefined ? config.default_options_deploy_pct * 100 : undefined}
            draftValue={capitalDrafts.options}
            suffix="%"
            step={0.5}
            onChange={(value) => setCapitalDrafts((d) => ({ ...d, options: value }))}
          />
        </Section>

        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-text font-semibold text-sm mb-1">Live IBKR trading</div>
              <div className="text-t3 text-xs max-w-md">
                Reveals "Open via IBKR" / "Close via IBKR" on the Transaction History ledger —
                places REAL orders against whatever IB Gateway your local proxy is connected to.
                Admin-only; never shown to subscribers regardless of this setting.
              </div>
            </div>
            <button
              onClick={toggleIbkr}
              disabled={savingSection === 'ibkr'}
              className={`shrink-0 ml-4 flex items-center w-11 h-6 px-0.5 rounded-full transition-colors ${
                ibkrLiveTradingEnabled ? 'bg-acc justify-end' : 'bg-s2 border border-border justify-start'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow" />
            </button>
          </div>
          {ibkrLiveTradingEnabled && (
            <div className="mt-3">
              <AlertStrip severity="warning">
                Live — the IBKR buttons are currently visible in Transaction History. Confirm your local
                proxy is pointed at paper (IB_PORT=4002) before placing any order while testing.
              </AlertStrip>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
