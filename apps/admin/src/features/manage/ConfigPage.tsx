import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppConfig, AlertStrip } from '@stw/ui';
import { fmtDateTime } from '@stw/shared';
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
interface RegimeDrafts { trend?: number; volatility?: number; credit?: number; rates_dollar?: number; gex?: number }

export function ConfigPage() {
  const { config, ibkrLiveTradingEnabled, regimeWeights } = useAppConfig();
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
  const [regimeDrafts, setRegimeDrafts] = useState<RegimeDrafts>({});
  const [savingSection, setSavingSection] = useState<'sizing' | 'capital' | 'regime' | 'ibkr' | null>(null);

  // Discord alert bot config (integration_secrets, migration 075) — admin-only. The bot
  // TOKEN is a secret (write-only: we fetch only updated_at, never the value); the GUILD ID
  // (the server the resolver searches) isn't a secret, so we show + edit it normally.
  const [discordToken, setDiscordToken] = useState('');
  const [guildIdDraft, setGuildIdDraft] = useState<string | undefined>(undefined);
  const discordSecret = useQuery({
    queryKey: ['integration_secret', 'discord'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_secrets').select('key, value, updated_at').in('key', ['discord_bot_token', 'discord_guild_id']);
      if (error) throw error;
      const rows = (data ?? []) as { key: string; value: string | null; updated_at: string }[];
      return {
        tokenSet: rows.find((r) => r.key === 'discord_bot_token') ?? null,
        guildId: rows.find((r) => r.key === 'discord_guild_id')?.value ?? '',
      };
    },
  });
  const guildId = guildIdDraft ?? discordSecret.data?.guildId ?? '';
  const saveDiscord = useMutation({
    mutationFn: async (vals: { token?: string; guildId?: string }) => {
      const rows: { key: string; value: string; updated_at: string }[] = [];
      if (vals.token) rows.push({ key: 'discord_bot_token', value: vals.token, updated_at: new Date().toISOString() });
      if (vals.guildId !== undefined) rows.push({ key: 'discord_guild_id', value: vals.guildId, updated_at: new Date().toISOString() });
      if (!rows.length) return;
      const { error } = await supabase.from('integration_secrets').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => { setDiscordToken(''); setGuildIdDraft(undefined); qc.invalidateQueries({ queryKey: ['integration_secret', 'discord'] }); },
  });
  const clearDiscordToken = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('integration_secrets').delete().eq('key', 'discord_bot_token');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration_secret', 'discord'] }),
  });

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

  async function saveRegime() {
    // Stored as percent integers, as-is (environmentScore normalizes by the total).
    const map: [keyof RegimeDrafts, string][] = [
      ['trend', 'regime_weight_trend'], ['volatility', 'regime_weight_volatility'],
      ['credit', 'regime_weight_credit'], ['rates_dollar', 'regime_weight_rates_dollar'],
      ['gex', 'regime_weight_gex'],
    ];
    const entries: [string, number][] = [];
    for (const [k, key] of map) if (regimeDrafts[k] !== undefined) entries.push([key, regimeDrafts[k] as number]);
    if (!entries.length) return;
    setSavingSection('regime');
    try { await saveMany.mutateAsync(entries); setRegimeDrafts({}); } finally { setSavingSection(null); }
  }

  const regimeTotal = (regimeDrafts.trend ?? regimeWeights.trend)
    + (regimeDrafts.volatility ?? regimeWeights.volatility)
    + (regimeDrafts.credit ?? regimeWeights.credit)
    + (regimeDrafts.rates_dollar ?? regimeWeights.rates_dollar)
    + (regimeDrafts.gex ?? regimeWeights.gex);

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
          title={<>Capital allocation &amp; live trading <span className="text-t3 text-[10px] font-semibold uppercase tracking-wide align-middle ml-1">Admin only</span></>}
          hint="Capital defaults power the quantity suggestion in the IBKR order modal (Transaction History → Open/Close via IBKR) — a starting point only, still adjustable per-order. Never read by apps/web. Save covers the capital fields; the live-trading switch below saves on toggle."
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
          {/* Live-trading switch — saves immediately on toggle (independent of the capital Save). */}
          <div className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-text font-semibold text-xs mb-1">Live IBKR trading</div>
                <div className="text-t3 text-xs max-w-md">
                  Reveals "Open via IBKR" / "Close via IBKR" on the Transaction History ledger — places
                  REAL orders against whatever IB Gateway your local proxy is connected to. Never shown
                  to subscribers regardless of this setting.
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
        </Section>

        <Section
          title="Market Regime weights"
          hint="How the five sleeves blend into the overall Market Regime score on the Macro tab. Scores are normalized by the total, so these need not sum to exactly 100% — the ratios are what matter. Applies forward to the live banner and the next daily snapshot."
          dirty={Object.keys(regimeDrafts).length > 0}
          saving={savingSection === 'regime'}
          onSave={saveRegime}
        >
          <NumberRow label="Trend" storedValue={regimeWeights.trend} draftValue={regimeDrafts.trend} suffix="%" onChange={(v) => setRegimeDrafts((d) => ({ ...d, trend: v }))} />
          <NumberRow label="Volatility" storedValue={regimeWeights.volatility} draftValue={regimeDrafts.volatility} suffix="%" onChange={(v) => setRegimeDrafts((d) => ({ ...d, volatility: v }))} />
          <NumberRow label="Credit" storedValue={regimeWeights.credit} draftValue={regimeDrafts.credit} suffix="%" onChange={(v) => setRegimeDrafts((d) => ({ ...d, credit: v }))} />
          <NumberRow label="Rates + Dollar" storedValue={regimeWeights.rates_dollar} draftValue={regimeDrafts.rates_dollar} suffix="%" onChange={(v) => setRegimeDrafts((d) => ({ ...d, rates_dollar: v }))} />
          <NumberRow label="GEX" storedValue={regimeWeights.gex} draftValue={regimeDrafts.gex} suffix="%" onChange={(v) => setRegimeDrafts((d) => ({ ...d, gex: v }))} />
          <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className={rowLabel}>Total</span>
            <span className={rowPrefix} />
            <span className="text-sm font-semibold text-t2">{regimeTotal}%</span>
            <span className="text-t3 text-xs">normalized — ratios are what matter, needn't equal 100%</span>
          </div>
        </Section>

        {(saveDiscord.isError || clearDiscordToken.isError) && (
          <AlertStrip severity="negative">Discord config save failed: {errMsg(saveDiscord.error ?? clearDiscordToken.error)}</AlertStrip>
        )}
        <Section
          title={<>Discord alert bot <span className="text-t3 text-[10px] font-semibold uppercase tracking-wide align-middle ml-1">Admin only</span></>}
          hint="The bot that DMs subscribers their drawdown alerts. Swap the test bot for another (e.g. the STW production bot) right here — no redeploy. The bot must be in the server below with the GUILD_MEMBERS intent so we can resolve a subscriber's username to their ID. Token is stored server-side, admin-only, never shown back."
          dirty={!!discordToken.trim() || (guildIdDraft !== undefined && guildIdDraft !== (discordSecret.data?.guildId ?? ''))}
          saving={saveDiscord.isPending}
          onSave={() => saveDiscord.mutate({ token: discordToken.trim() || undefined, guildId: guildIdDraft })}
        >
          <div className="py-3 first:pt-0 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className={rowLabel}>Bot token</span>
              <span className={rowPrefix} />
              <input
                type="password"
                value={discordToken}
                onChange={(e) => setDiscordToken(e.target.value)}
                // A dotted placeholder signals "a token is already stored" (it's write-only —
                // we never load the real value); typing replaces it.
                placeholder={discordSecret.data?.tokenSet ? '•••••••••••••••• — type a new token to replace' : 'Paste the Discord bot token'}
                autoComplete="off"
                className={`flex-1 ${rowInput}`}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className={rowLabel} />
              <span className={rowPrefix} />
              <span className="text-t3 text-xs">
                {discordSecret.isLoading ? 'Checking…'
                  : discordSecret.data?.tokenSet ? `Token set · updated ${fmtDateTime(discordSecret.data.tokenSet.updated_at)}`
                  : 'No token — Discord DMs are off until a token is saved.'}
              </span>
              {discordSecret.data?.tokenSet && (
                <button
                  onClick={() => clearDiscordToken.mutate()}
                  disabled={clearDiscordToken.isPending}
                  className="text-xs text-t3 hover:text-t2 underline disabled:opacity-40"
                >
                  {clearDiscordToken.isPending ? 'Clearing…' : 'Clear'}
                </button>
              )}
            </div>
          </div>
          <div className="py-3 last:pb-0 flex items-center gap-3">
            <span className={rowLabel}>Server (guild) ID</span>
            <span className={rowPrefix} />
            <input
              type="text"
              inputMode="numeric"
              value={guildId}
              onChange={(e) => setGuildIdDraft(e.target.value)}
              placeholder="e.g. 1289… (right-click the server → Copy Server ID)"
              autoComplete="off"
              className={`flex-1 ${rowInput}`}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
