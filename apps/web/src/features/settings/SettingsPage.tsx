import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIbkrSettings, saveIbkrSettings, useAuthStore, useSyncPortfolio, LoadingSpinner } from '@stw/ui';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  padding: '10px 12px',
  // 16px prevents iOS auto-zoom on focus
  fontSize: 16,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
};

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useIbkrSettings();
  const { sync, isSyncing, syncError, lastResult } = useSyncPortfolio();

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
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 48px' }}>

      {/* IBKR Connection card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>

        {/* Card header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bsub)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
            IBKR Connection
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
            background: isConnected ? 'var(--c5bg)' : 'var(--s2)',
            color: isConnected ? 'var(--acc)' : 'var(--t3)',
            border: `1px solid ${isConnected ? 'var(--c5b)' : 'var(--border)'}`,
          }}>
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        {/* Setup instructions */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            How to connect
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              <>Log in to <b style={{ color: 'var(--t2)' }}>clientportal.ibkr.com</b> or <b style={{ color: 'var(--t2)' }}>account.ibkr.com</b></>,
              <>Go to <b style={{ color: 'var(--t2)' }}>Reports → Flex Queries</b></>,
              <>Click <b style={{ color: 'var(--t2)' }}>Create → Activity Flex Query</b></>,
              <>Under <b style={{ color: 'var(--t2)' }}>Sections</b>, enable <b style={{ color: 'var(--t2)' }}>Open Positions</b> and tick: Symbol, Asset Category, Quantity, Cost Basis Price, Mark Price, Unrealized P&amp;L, Put/Call, Strike, Expiry, Multiplier, Conid</>,
              <>Save the query — note the <b style={{ color: 'var(--t2)' }}>Query ID</b> shown next to it</>,
              <>Back on Flex Queries, copy your <b style={{ color: 'var(--t2)' }}>Flex Token</b> (top of page, under "Generate Tokens")</>,
              <>Paste both below, click <b style={{ color: 'var(--t2)' }}>Save</b>, then <b style={{ color: 'var(--t2)' }}>Sync</b></>,
            ].map((step, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>{step}</li>
            ))}
          </ol>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 10, marginBottom: 0 }}>
            Your token is stored server-side and never exposed in the browser.
          </p>
        </div>

        {/* Form fields */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Flex Token */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>
              Flex Token
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your Flex Token"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                style={{ ...inputStyle, paddingRight: 56 }}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'var(--t3)', padding: '4px',
                }}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Query ID */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>
              Query ID
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={queryId}
              onChange={(e) => setQueryId(e.target.value)}
              placeholder="e.g. 123456"
              autoComplete="off"
              style={inputStyle}
            />
          </div>

          {saveError && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: '#2d0c0c', border: '1px solid var(--c1b)', color: 'var(--c1)', fontSize: 12 }}>
              {saveError}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1, minWidth: 100,
                padding: '10px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600,
                background: 'var(--acc)', color: '#000', border: 'none',
                cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </button>

            {isConnected && (
              <button
                onClick={sync}
                disabled={isSyncing}
                style={{
                  flex: 1, minWidth: 100,
                  padding: '10px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600,
                  background: 'var(--s2)', color: 'var(--text)',
                  border: '1px solid var(--border)',
                  cursor: isSyncing ? 'default' : 'pointer', opacity: isSyncing ? 0.6 : 1,
                }}
              >
                {isSyncing ? 'Syncing…' : 'Sync Portfolio'}
              </button>
            )}
          </div>

          {syncError && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: '#2d0c0c', border: '1px solid var(--c1b)', color: 'var(--c1)', fontSize: 12 }}>
              {syncError}. IBKR reports can take up to 10 seconds — try again if it timed out.
            </div>
          )}

          {lastResult && (
            <div style={{ fontSize: 12, color: 'var(--acc)' }}>
              ✓ Synced {lastResult.count} position{lastResult.count !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
