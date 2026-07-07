import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useIbkrSettings, saveIbkrSettings, useAuthStore, useSyncPortfolio, LoadingSpinner,
  Button, StatusPill, AlertStrip, FormRow, TextInput,
  RiskConfigForm, useRiskConfig, useEnsureRiskConfig,
} from '@stw/ui';
import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACE } from '@stw/shared';
import { useTierAccess } from '../../shared/hooks/useTierAccess';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useIbkrSettings();
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

  useEffect(() => {
    if (settings) {
      setToken(settings.ibkr_flex_token ?? '');
      setQueryId(settings.ibkr_query_id ?? '');
    }
  }, [settings]);

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
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  const isConnected = !!(settings?.ibkr_flex_token && settings?.ibkr_query_id);

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: `${SPACE[4]}px ${SPACE[4]}px ${SPACE[12]}px` }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE[4], alignItems: 'flex-start' }}>

      {/* IBKR Connection card */}
      <div style={{
        flex: '1 1 460px', minWidth: 320,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: RADIUS.xl, overflow: 'hidden',
      }}>

        {/* Card header */}
        <div style={{ padding: `${SPACE[3.5]}px ${SPACE[4]}px`, borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: SPACE[2.5] }}>
          <span style={{ fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.base, color: 'var(--text)' }}>
            IBKR Connection
          </span>
          <StatusPill variant={isConnected ? 'ok' : 'neutral'}>
            {isConnected ? 'Connected' : 'Not connected'}
          </StatusPill>
        </div>

        {/* Setup instructions */}
        <div style={{ padding: `${SPACE[3.5]}px ${SPACE[4]}px`, borderBottom: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginBottom: SPACE[2], textTransform: 'uppercase', letterSpacing: LETTER_SPACING.label, fontWeight: FONT_WEIGHT.semibold }}>
            How to connect
          </div>
          <ol style={{ margin: 0, paddingLeft: SPACE[5], display: 'flex', flexDirection: 'column', gap: SPACE[1.5] }}>
            {[
              <>Log in to <b style={{ color: 'var(--t2)' }}>clientportal.ibkr.com</b> or <b style={{ color: 'var(--t2)' }}>account.ibkr.com</b></>,
              <>Go to <b style={{ color: 'var(--t2)' }}>Reports → Flex Queries</b></>,
              <>Click <b style={{ color: 'var(--t2)' }}>Create → Activity Flex Query</b></>,
              <>Under <b style={{ color: 'var(--t2)' }}>Sections</b>, enable <b style={{ color: 'var(--t2)' }}>Open Positions</b> and tick: Symbol, Underlying Symbol, Asset Category, Quantity, Cost Basis Price, Mark Price, Unrealized P&amp;L, Put/Call, Strike, Expiry, Multiplier, Conid</>,
              <>Save the query — note the <b style={{ color: 'var(--t2)' }}>Query ID</b> shown next to it</>,
              <>Back on Flex Queries, copy your <b style={{ color: 'var(--t2)' }}>Flex Token</b> (top of page, under "Generate Tokens")</>,
              <>Paste both below, click <b style={{ color: 'var(--t2)' }}>Save</b>, then <b style={{ color: 'var(--t2)' }}>Sync</b></>,
            ].map((step, i) => (
              <li key={i} style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', lineHeight: 1.6 }}>{step}</li>
            ))}
          </ol>
          <p style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[2.5], marginBottom: 0 }}>
            Your token is stored server-side and never exposed in the browser.
          </p>
        </div>

        {/* Form fields */}
        <div style={{ padding: `${SPACE[3.5]}px ${SPACE[4]}px`, display: 'flex', flexDirection: 'column', gap: SPACE[3.5] }}>

          {/* Flex Token */}
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

          {/* Query ID */}
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

          {/* Buttons */}
          <div style={{ display: 'flex', gap: SPACE[2], flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 1, minWidth: 100 }}
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </Button>

            {isConnected && (
              <Button
                variant="secondary"
                onClick={sync}
                disabled={isSyncing}
                style={{ flex: 1, minWidth: 100 }}
              >
                {isSyncing ? 'Syncing…' : 'Sync Portfolio'}
              </Button>
            )}
          </div>

          {syncError && (
            <AlertStrip severity="negative">
              {syncError}
              {syncError.toLowerCase().includes('timed out') && ' Try again in a few seconds.'}
            </AlertStrip>
          )}

          {lastResult && (
            <AlertStrip severity="positive">
              Synced {lastResult.count} position{lastResult.count !== 1 ? 's' : ''}
            </AlertStrip>
          )}
        </div>
      </div>

      {/* Your thresholds card — Premium only (plans/integrity-guardrails.md Item 2).
          Setup only: no sync button, no violation display — that lives on My
          Portfolio (packages/ui/src/features/portfolio/PortfolioPage.tsx). */}
      <div style={{ flex: '1 1 380px', minWidth: 280 }}>
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
    </div>
  );
}
