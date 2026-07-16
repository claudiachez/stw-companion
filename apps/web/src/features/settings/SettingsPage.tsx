import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useIbkrSettings, saveIbkrSettings, useAuthStore, useSyncPortfolio, useUserPositions, LoadingSpinner,
  Button, StatusPill, AlertStrip, FormRow, TextInput,
  RiskConfigForm, useRiskConfig, useEnsureRiskConfig,
} from '@stw/ui';
import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACE, fmtDateTime } from '@stw/shared';
import { useTierAccess } from '../../shared/hooks/useTierAccess';

const bold = { color: 'var(--t2)' } as const;
// "→ what this feeds" note under each data section, so it's clear why each block
// of fields is needed and which part of the app it powers.
const feeds = (text: React.ReactNode) => (
  <span style={{ display: 'block', marginTop: 3, color: 'var(--t3)', fontSize: 'inherit' }}>→ Feeds: {text}</span>
);

// A step is a numbered line; `sub` holds its lettered sub-items (a, b, c…).
// Step 3 fans out into the four Flex sections, so they read as "enable these four"
// rather than four sibling top-level steps.
interface ConnectStep { text: React.ReactNode; sub?: React.ReactNode[]; }

const CONNECT_STEPS: ConnectStep[] = [
  { text: <>Log in to <b style={bold}>clientportal.ibkr.com</b> or <b style={bold}>account.ibkr.com</b>.</> },
  { text: <>Go to <b style={bold}>Reports → Flex Queries</b>.</> },
  {
    text: <>Click <b style={bold}>Create → Activity Flex Query</b>. Under <b style={bold}>Sections</b>, enable these four (one query carries them all):</>,
    sub: [
      <>
        <b style={bold}>Open Positions</b> — tick: Symbol, Underlying Symbol, Asset Category, Quantity, Cost Basis Price, <b style={bold}>Cost Basis Money</b>, Mark Price, Unrealized P&amp;L, Put/Call, Strike, Expiry, Multiplier, Conid.
        {feeds(<>your live positions on <b style={bold}>My Portfolio</b>, and the position / sector / gross concentration checks on the <b style={bold}>Risk</b> tab.</>)}
      </>,
      <>
        <b style={bold}>Trades</b> — set <b style={bold}>Options → Level of Detail = Execution</b>, then tick: <b style={bold}>IB Execution ID</b> (not <i>External</i>), Asset Category, Date/Time, Symbol, Underlying Symbol, Buy/Sell, Quantity, <b style={bold}>Trade Price</b> (not <i>Orig Trade Price</i>), IB Commission, <b style={bold}>Currency</b> (not <i>IB Commission Currency</i>), Put/Call, Strike, Expiry, Multiplier, IB Order ID, Trade ID, Transaction ID.
        {feeds(<>your executions history + trade-cost analysis (your fills vs the mark).</>)}
      </>,
      <>
        <b style={bold}>Net Asset Value (NAV) in Base</b> — tick <b style={bold}>Total</b> (your Net Liquidation Value) and <b style={bold}>Report Date</b>.
        {feeds(<>your <b style={bold}>live account equity</b> — the denominator for gross exposure — so the Risk tab measures against your <b style={bold}>current balance (incl. margin)</b>, not a stale deposit figure.</>)}
      </>,
      <>
        <b style={bold}>Change in NAV</b> — tick <b style={bold}>Deposits/Withdrawals</b> (plus <b style={bold}>Starting Value</b> and <b style={bold}>Ending Value</b>).
        {feeds(<>separates the cash you <b style={bold}>add or withdraw</b> from real gains and losses — so a deposit or withdrawal isn’t mistaken for a drawdown when the Risk tab measures how far you’re down from your peak.</>)}
      </>,
    ],
  },
  {
    text: <>
      Under <b style={bold}>General Configuration</b>, leave Date Format <b style={bold}>yyyyMMdd</b>, Time Format <b style={bold}>HHmmss</b>, <b style={bold}>Breakout by Day = No</b>, and set <b style={bold}>Period → Last 7 Days</b>.
      {feeds(<>a short window keeps the report fast. The app syncs automatically each day into an <b style={bold}>append-only</b> history, so no fill is ever dropped. To load <b style={bold}>past</b> trades in one go, use <b style={bold}>Import trade history</b> below.</>)}
    </>,
  },
  { text: <>Save the query — note the <b style={bold}>Query ID</b> shown next to it.</> },
  { text: <>Back on Flex Queries, copy your <b style={bold}>Flex Token</b> (top of the page, under "Generate Tokens").</> },
  { text: <>Paste both below and click <b style={bold}>Save</b>. We verify immediately and <b style={bold}>flag any missing field</b> right here.</> },
];

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useIbkrSettings();
  const { data: positions } = useUserPositions();
  const { sync, isSyncing, syncError, lastResult } = useSyncPortfolio();
  const canUseLimits = useTierAccess('limits');
  const { data: riskConfig, isLoading: riskConfigLoading } = useRiskConfig(canUseLimits ? user?.id : undefined);
  useEnsureRiskConfig(canUseLimits ? user?.id : undefined, riskConfig, riskConfigLoading);

  const [token, setToken] = useState('');
  const [queryId, setQueryId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // One-time full-history import from an uploaded Flex XML export.
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ executions: number; accountId: string | null } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Setup is onboarding content a returning, already-connected user rarely needs — collapsed
  // by default once connected, expanded by default on first-ever setup. Initialized once
  // `settings` first resolves (its own effect below), not at mount, since isConnected isn't
  // known yet on the very first render.
  const [editingConnection, setEditingConnection] = useState(false);
  const [howToConnectExpanded, setHowToConnectExpanded] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (settings) {
      setToken(settings.ibkr_flex_token ?? '');
      setQueryId(settings.ibkr_query_id ?? '');
      if (!initializedRef.current) {
        const connected = !!(settings.ibkr_flex_token && settings.ibkr_query_id);
        setEditingConnection(!connected);
        setHowToConnectExpanded(!connected);
        initializedRef.current = true;
      }
    }
  }, [settings]);

  // Once we know a sync actually worked (manual, or the save-triggered verification below),
  // there's no reason to keep the setup form open.
  useEffect(() => {
    if (lastResult && !syncError) setEditingConnection(false);
  }, [lastResult, syncError]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await saveIbkrSettings(user.id, {
        ibkr_flex_token: token.trim() || null,
        ibkr_query_id:   queryId.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ['ibkr-settings', user.id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Verify immediately — a typo'd token/Query ID should fail visibly here, at save
      // time, not silently later at the next manual Sync.
      if (token.trim() && queryId.trim()) {
        await sync();
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleImportFile(file: File) {
    if (!session?.access_token) { setImportError('Not signed in'); return; }
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const xml = await file.text();
      const res = await fetch('/.netlify/functions/ibkr-import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml', Authorization: `Bearer ${session.access_token}` },
        body: xml,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setImportResult({ executions: json.executions ?? 0, accountId: json.accountId ?? null });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  const isConnected = !!(settings?.ibkr_flex_token && settings?.ibkr_query_id);
  const lastSyncedAt = positions?.length
    ? positions.reduce((latest, p) => (p.last_synced_at > latest ? p.last_synced_at : latest), positions[0].last_synced_at)
    : null;

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
    <div style={{ maxWidth: 780, margin: '0 auto', padding: `${SPACE[4]}px ${SPACE[4]}px ${SPACE[8]}px`, display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>

      {/* Compact connection status strip — the "done" state once connected. Setup/edit
          only reappears behind the toggle below, never as permanent prime real estate. */}
      {isConnected && (
        <div style={{
          background: 'var(--status-positive-bg)', border: '1px solid var(--status-positive-border)',
          borderRadius: RADIUS.lg, padding: `${SPACE[2.5]}px ${SPACE[3.5]}px`,
          display: 'flex', alignItems: 'center', gap: SPACE[3], flexWrap: 'wrap',
        }}>
          <StatusPill variant="ok">Connected</StatusPill>
          <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)' }}>
            {lastSyncedAt ? `Last synced: ${fmtDateTime(lastSyncedAt)}` : 'Never synced yet'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], marginLeft: 'auto' }}>
            <Button variant="secondary" onClick={sync} disabled={isSyncing} style={{ padding: `${SPACE[1]}px ${SPACE[2.5]}px`, fontSize: FONT_SIZE.sm }}>
              {isSyncing ? 'Syncing…' : 'Sync Portfolio'}
            </Button>
            <button
              type="button"
              onClick={() => setEditingConnection((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', fontSize: FONT_SIZE.sm, whiteSpace: 'nowrap' }}
            >
              {editingConnection ? 'Hide connection ▾' : 'Edit connection ▸'}
            </button>
          </div>
        </div>
      )}

      {syncError && (
        <AlertStrip severity="negative">
          {syncError}
          {syncError.toLowerCase().includes('timed out') && ' Try again in a few seconds.'}
        </AlertStrip>
      )}
      {lastResult && !syncError && (
        <AlertStrip severity="positive">
          Verified ✓ — {lastResult.accountId ? `account ${lastResult.accountId} · ` : ''}
          synced {lastResult.count} position{lastResult.count !== 1 ? 's' : ''}
          {lastResult.executions > 0 ? ` · ${lastResult.executions} execution${lastResult.executions !== 1 ? 's' : ''}` : ''}
          {lastResult.nlv != null ? ` · NLV ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(lastResult.nlv)}` : ''}
        </AlertStrip>
      )}
      {/* Non-fatal Flex-template config gaps — the sync succeeded, but a section/field is
          missing. Tells the user exactly what to tick in their query rather than leaving
          a column silently empty. */}
      {lastResult && !syncError && lastResult.warnings.length > 0 && (
        <AlertStrip severity="warning">
          <span style={{ fontWeight: FONT_WEIGHT.semibold }}>Your Flex query is missing something:</span>
          <ul style={{ margin: `${SPACE[1]}px 0 0`, paddingLeft: SPACE[4], display: 'flex', flexDirection: 'column', gap: SPACE[1] }}>
            {lastResult.warnings.map((w, i) => <li key={i} style={{ lineHeight: 1.5 }}>{w}</li>)}
          </ul>
        </AlertStrip>
      )}

      {/* Setup / edit panel — collapsed once connected; always open on first-ever setup. */}
      {(!isConnected || editingConnection) && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>

          <div style={{ padding: `${SPACE[3.5]}px ${SPACE[4]}px`, borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: SPACE[2.5] }}>
            <span style={{ fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.base, color: 'var(--text)' }}>
              IBKR Connection
            </span>
            {!isConnected && <StatusPill variant="neutral">Not connected</StatusPill>}
          </div>

          {/* How to connect — its own nested collapse, independent of the panel toggle above:
              expanded by default only for a first-time setup, collapsed the moment you're
              back here just to rotate a token. */}
          <div style={{ borderBottom: '1px solid var(--bsub)' }}>
            <button
              type="button"
              onClick={() => setHowToConnectExpanded((v) => !v)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                padding: `${SPACE[3]}px ${SPACE[4]}px`, display: 'flex', alignItems: 'center', gap: SPACE[1.5],
                fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', textTransform: 'uppercase',
                letterSpacing: LETTER_SPACING.label, fontWeight: FONT_WEIGHT.semibold,
              }}
            >
              <span style={{ display: 'inline-block', transform: howToConnectExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
              How to connect
            </button>
            {howToConnectExpanded && (
              <div style={{ padding: `0 ${SPACE[4]}px ${SPACE[3.5]}px` }}>
                {/* Explicit number badges — the design-system CSS reset strips native
                    <ol> markers, so step numbers (and lettered sub-items) are rendered,
                    not relied on. Step 3 nests the four Flex sections as a, b, c, d. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
                  {CONNECT_STEPS.map((step, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: SPACE[1.5] }}>
                      <div style={{ display: 'flex', gap: SPACE[2.5], alignItems: 'flex-start' }}>
                        <span style={{
                          flexShrink: 0, width: 20, height: 20, borderRadius: RADIUS.full,
                          background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--t2)',
                          fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                        }}>{i + 1}</span>
                        <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', lineHeight: 1.6 }}>{step.text}</span>
                      </div>
                      {step.sub && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[1.5], paddingLeft: SPACE[2.5] + 20 + SPACE[2.5] }}>
                          {step.sub.map((s, j) => (
                            <div key={j} style={{ display: 'flex', gap: SPACE[2], alignItems: 'flex-start' }}>
                              <span style={{
                                flexShrink: 0, width: 18, height: 18, borderRadius: RADIUS.full,
                                background: 'transparent', border: '1px solid var(--border)', color: 'var(--t3)',
                                fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                              }}>{String.fromCharCode(97 + j)}</span>
                              <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', lineHeight: 1.6 }}>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[2.5], marginBottom: 0 }}>
                  Your token is stored server-side and never exposed in the browser.
                </p>
              </div>
            )}
          </div>

          {/* Form fields */}
          <div style={{ padding: `${SPACE[3.5]}px ${SPACE[4]}px`, display: 'flex', flexDirection: 'column', gap: SPACE[3.5] }}>

            <FormRow label="Flex Token">
              <div style={{ position: 'relative' }}>
                <TextInput
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your Flex Token"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  style={{ paddingRight: SPACE[12] + SPACE[2] }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  style={{
                    position: 'absolute', right: SPACE[2.5], top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: FONT_SIZE.sm, color: 'var(--t3)', padding: SPACE[1],
                  }}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
            </FormRow>

            <FormRow label="Query ID">
              <TextInput
                type="text"
                inputMode="numeric"
                value={queryId}
                onChange={(e) => setQueryId(e.target.value)}
                placeholder="e.g. 123456"
                autoComplete="off"
              />
            </FormRow>

            {saveError && <AlertStrip severity="negative">{saveError}</AlertStrip>}

            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              style={{ alignSelf: 'flex-start', minWidth: 120 }}
            >
              {saving ? (token.trim() && queryId.trim() ? 'Saving & verifying…' : 'Saving…') : saved ? 'Saved ✓' : 'Save'}
            </Button>
          </div>

          {/* Import trade history — part of the connection section. Backfills the full
              history the short live window can't reach, and (via refresh-on-conflict)
              repairs a broken/price-less history on re-import. */}
          <div style={{ borderTop: '1px solid var(--bsub)', padding: `${SPACE[3.5]}px ${SPACE[4]}px`, display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
            <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>Import trade history</span>
            <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', lineHeight: 1.55 }}>
              The daily sync only carries the last few days. To load your <b style={bold}>full past history</b> in one go — or to
              <b style={bold}> repair</b> a broken one — run your Flex query in the IBKR portal with a long <b style={bold}>Period</b>
              {' '}(e.g. Year to Date), download the <b style={bold}>XML</b>, and upload it here. Re-importing
              {' '}<b style={bold}>refreshes</b> existing fills (e.g. to backfill prices); your live positions are left untouched.
            </span>
            <input
              ref={importInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
            />
            <Button
              variant="secondary"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              style={{ alignSelf: 'flex-start' }}
            >
              {importing ? 'Importing…' : 'Choose Flex XML…'}
            </Button>
            {importResult && (
              <AlertStrip severity="positive">
                Imported {importResult.executions} fill{importResult.executions !== 1 ? 's' : ''}
                {importResult.accountId ? ` from account ${importResult.accountId}` : ''} — prices refreshed, duplicates merged.
              </AlertStrip>
            )}
            {importError && <AlertStrip severity="negative">{importError}</AlertStrip>}
          </div>
        </div>
      )}

      {/* Your thresholds — Premium only (plans/integrity-guardrails.md Item 2). */}
      <div>
        {canUseLimits ? (
          riskConfigLoading || !riskConfig ? (
            <LoadingSpinner />
          ) : (
            <RiskConfigForm userId={user!.id} config={riskConfig} />
          )
        ) : (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: RADIUS.xl, padding: SPACE[4], display: 'flex', flexDirection: 'column', gap: SPACE[1.5],
          }}>
            <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>Limits engine 🔒</span>
            <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>
              Flag concentration and gross-exposure breaches in your own IBKR book — requires a
              <strong style={{ color: 'var(--t2)' }}> Premium</strong> subscription. Contact your STW
              administrator to upgrade.
            </span>
          </div>
        )}
      </div>

    </div>
    </div>
  );
}
