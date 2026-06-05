import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIbkrSettings } from '@stw/ui';
import { saveIbkrSettings } from '@stw/ui';
import { useAuthStore } from '@stw/ui';
import { useSyncPortfolio } from '@stw/ui';
import { LoadingSpinner } from '@stw/ui';

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 5, padding: '8px 10px', fontSize: 13, color: 'var(--text)',
  outline: 'none', boxSizing: 'border-box',
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
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="font-display font-extrabold text-2xl text-text mb-6">Settings</h1>

      <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-5">

        {/* Section header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
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
          <ol style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6, lineHeight: 1.9, paddingLeft: 18 }}>
            <li>Log in to <strong style={{ color: 'var(--t2)' }}>Client Portal</strong> (clientportal.ibkr.com) or <strong style={{ color: 'var(--t2)' }}>Account Management</strong> (account.ibkr.com)</li>
            <li>Go to <strong style={{ color: 'var(--t2)' }}>Reports → Flex Queries</strong></li>
            <li>Click <strong style={{ color: 'var(--t2)' }}>Create</strong> → choose <strong style={{ color: 'var(--t2)' }}>Activity Flex Query</strong></li>
            <li>Under <strong style={{ color: 'var(--t2)' }}>Sections</strong>, enable <strong style={{ color: 'var(--t2)' }}>Open Positions</strong> and tick: Symbol, Asset Category, Quantity, Cost Basis Price, Mark Price, Unrealized P&amp;L, Put/Call, Strike, Expiry, Multiplier, Conid</li>
            <li>Save the query — note the <strong style={{ color: 'var(--t2)' }}>Query ID</strong> shown next to it</li>
            <li>Back on the Flex Queries page, copy your <strong style={{ color: 'var(--t2)' }}>Flex Token</strong> (top of the page, under "Generate Tokens")</li>
            <li>Paste both below and click <strong style={{ color: 'var(--t2)' }}>Save</strong>, then <strong style={{ color: 'var(--t2)' }}>Sync Portfolio</strong></li>
          </ol>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
            Your token is stored securely server-side and never exposed in the browser.
          </p>
        </div>

        <div className="h-px bg-border" />

        {/* Flex Token */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Flex Token
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your Flex Token"
              style={{ ...inputStyle, paddingRight: 72 }}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: 'var(--t3)',
              }}
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {/* Query ID */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Query ID
          </label>
          <input
            type="text"
            value={queryId}
            onChange={(e) => setQueryId(e.target.value)}
            placeholder="e.g. 123456"
            style={inputStyle}
          />
        </div>

        {saveError && (
          <div style={{ padding: '8px 12px', borderRadius: 6, background: '#2d0c0c', border: '1px solid var(--c1b)', color: 'var(--c1)', fontSize: 12 }}>
            {saveError}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
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
                padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
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
  );
}
