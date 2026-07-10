import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useIbkrSettings, saveIbkrSettings, useAuthStore, useSyncPortfolio, useUserPositions, LoadingSpinner,
  Button, StatusPill, AlertStrip, FormRow, TextInput,
  RiskConfigForm, useRiskConfig, useEnsureRiskConfig,
} from '@stw/ui';
import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACE, fmtDateTime } from '@stw/shared';
import { useTierAccess } from '../../shared/hooks/useTierAccess';

const CONNECT_STEPS = [
  <>Log in to <b style={{ color: 'var(--t2)' }}>clientportal.ibkr.com</b> or <b style={{ color: 'var(--t2)' }}>account.ibkr.com</b></>,
  <>Go to <b style={{ color: 'var(--t2)' }}>Reports → Flex Queries</b></>,
  <>Click <b style={{ color: 'var(--t2)' }}>Create → Activity Flex Query</b></>,
  <>Under <b style={{ color: 'var(--t2)' }}>Sections</b>, enable <b style={{ color: 'var(--t2)' }}>Open Positions</b> and tick: Symbol, Underlying Symbol, Asset Category, Quantity, Cost Basis Price, Mark Price, Unrealized P&amp;L, Put/Call, Strike, Expiry, Multiplier, Conid</>,
  <>In the same query, also enable <b style={{ color: 'var(--t2)' }}>Trades</b>, set <b style={{ color: 'var(--t2)' }}>Options → Level of Detail = Execution</b>, and tick: <b style={{ color: 'var(--t2)' }}>IB Execution ID</b> (not <i>External</i> Execution ID), Asset Category, Date/Time, Symbol, Underlying Symbol, Buy/Sell, Quantity, <b style={{ color: 'var(--t2)' }}>Trade Price</b> (not <i>Orig</i> Trade Price), IB Commission, <b style={{ color: 'var(--t2)' }}>Currency</b> (not IB Commission Currency), Put/Call, Strike, Expiry, Multiplier, IB Order ID, Trade ID, Transaction ID</>,
  <>Save the query — note the <b style={{ color: 'var(--t2)' }}>Query ID</b> shown next to it</>,
  <>Back on Flex Queries, copy your <b style={{ color: 'var(--t2)' }}>Flex Token</b> (top of page, under "Generate Tokens")</>,
  <>Paste both below, click <b style={{ color: 'var(--t2)' }}>Save</b></>,
];

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
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

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  const isConnected = !!(settings?.ibkr_flex_token && settings?.ibkr_query_id);
  const lastSyncedAt = positions?.length
    ? positions.reduce((latest, p) => (p.last_synced_at > latest ? p.last_synced_at : latest), positions[0].last_synced_at)
    : null;

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
    <div style={{ maxWidth: 640, margin: '0 auto', padding: `${SPACE[4]}px ${SPACE[4]}px ${SPACE[8]}px`, display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>

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
                <ol style={{ margin: 0, paddingLeft: SPACE[5], display: 'flex', flexDirection: 'column', gap: SPACE[1.5] }}>
                  {CONNECT_STEPS.map((step, i) => (
                    <li key={i} style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', lineHeight: 1.6 }}>{step}</li>
                  ))}
                </ol>
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
