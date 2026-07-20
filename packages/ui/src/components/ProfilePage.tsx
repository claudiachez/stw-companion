import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FONT_SIZE, FONT_WEIGHT, SPACE, RADIUS, SHADOW, formatMonthYear, fmtDateTime,
} from '@stw/shared';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { useThemeStore, type Theme } from '../store/theme';
import { usePrivacyStore } from '../store/privacy';
import { useCapabilities } from '../context/AppCapabilities';
import { LoadingSpinner } from '../primitives/LoadingSpinner';
import { StatusPill, type StatusPillVariant } from '../primitives/StatusPill';
import { AlertStrip } from '../primitives/AlertStrip';
import { Button } from '../primitives/Button';
import { TextInput } from '../primitives/TextInput';
import { useIbkrSettings } from '../features/portfolio/useUserPositions';
import { useRiskConfig } from '../features/limits/useRiskConfig';
import { usePicksTabStore, coercePicksTab, PICKS_TABS, PICKS_TAB_LABELS, type PicksTab } from '../features/picks/usePicksTab';

const TIER_LABELS: Record<string, string> = { free: 'Free', basic: 'Basic', premium: 'Premium' };

// Approval status → pill variant. Pending is amber (`warning`) per the redesign — a caution
// state ("waiting on review"), rendered via the generic `warning` variant rather than `near`
// (which means "≥80% of a limit").
const STATUS_VARIANT: Record<string, StatusPillVariant> = {
  pending: 'warning',
  approved: 'ok',
  rejected: 'breach',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Not approved',
};

// Interim contact for account-deletion requests — there's no dedicated support inbox yet
// (no destructive self-delete endpoint exists by design). Flagged in the redesign PR.
const SUPPORT_EMAIL = 'cc@claudiachez.com';

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.xl, padding: SPACE[4],
};
const sectionLabel: React.CSSProperties = {
  fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--t3)',
};

export function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useCapabilities();
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const showMoney = usePrivacyStore((s) => s.showMoney);
  const toggleMoney = usePrivacyStore((s) => s.toggle);
  const defaultTab = usePicksTabStore((s) => s.defaultTab);
  const setDefaultTab = usePicksTabStore((s) => s.setDefaultTab);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await getSupabase().from('profiles').select('*').eq('user_id', user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: ibkr } = useIbkrSettings();
  const { data: riskConfig } = useRiskConfig(user?.id);

  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameErr, setNameErr] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  const name = profile?.display_name ?? user?.email?.split('@')[0] ?? '—';
  const initial = (name[0] ?? '?').toUpperCase();
  const status = profile?.status ?? 'pending';
  const tier = profile ? (TIER_LABELS[profile.subscription_tier] ?? profile.subscription_tier) : '—';
  const ibkrConnected = !!(ibkr?.ibkr_flex_token && ibkr?.ibkr_query_id);
  const ibkrSyncedAt = riskConfig?.ibkr_nlv_at ?? null;

  async function changePassword() {
    if (!user?.email) return;
    const { error } = await getSupabase().auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setPwMsg(error ? `Couldn't send the reset email: ${error.message}` : 'Password reset email sent — check your inbox.');
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    navigate('/login');
  }

  function requestDeletion() {
    const subject = encodeURIComponent('Delete my STW Companion account');
    const body = encodeURIComponent(`Please delete my account (${user?.email ?? ''}).`);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  function openNameEdit() {
    const parts = (profile?.display_name ?? '').trim().split(/\s+/).filter(Boolean);
    setFirst(parts[0] ?? '');
    setLast(parts.slice(1).join(' '));
    setNameErr(null);
    setEditingName(true);
  }

  async function saveName() {
    const full = `${first.trim()} ${last.trim()}`.trim();
    if (!full) { setNameErr('Enter a name.'); return; }
    setSavingName(true);
    setNameErr(null);
    const { error } = await getSupabase().rpc('set_my_display_name', { new_name: full });
    setSavingName(false);
    if (error) { setNameErr(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    setEditingName(false);
  }

  const prefRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: SPACE[3], padding: `${SPACE[2.5]}px 0`, flexWrap: 'wrap',
  };
  const prefLabel = <T extends string>(title: T, hint: string) => (
    <span style={{ flex: 1, minWidth: 180 }}>
      <span style={{ display: 'block', fontSize: FONT_SIZE.base, color: 'var(--text)' }}>{title}</span>
      <span style={{ display: 'block', fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{hint}</span>
    </span>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: `${SPACE[5]}px ${SPACE[4]}px ${SPACE[10]}px`, display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>

        {/* Identity */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[3.5] }}>
            <div style={{
              width: 52, height: 52, borderRadius: RADIUS.full, background: 'var(--s2)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: 'var(--acc)', flexShrink: 0,
            }}>{initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap' }}>
                <span style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{name}</span>
                <StatusPill variant={STATUS_VARIANT[status] ?? 'unevaluated'}>{STATUS_LABEL[status] ?? status}</StatusPill>
                <StatusPill variant="neutral">{tier}</StatusPill>
                {!editingName && (
                  <button
                    onClick={openNameEdit}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)' }}
                  >Edit</button>
                )}
              </div>
              <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>
                {user?.email}{profile?.created_at ? ` · member since ${formatMonthYear(profile.created_at)}` : ''}
              </div>
            </div>
          </div>

          {editingName && (
            <div style={{ marginTop: SPACE[3], display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
              <div style={{ display: 'flex', gap: SPACE[2], flexWrap: 'wrap' }}>
                <TextInput value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" aria-label="First name" style={{ flex: 1, minWidth: 140 }} />
                <TextInput value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" aria-label="Last name" style={{ flex: 1, minWidth: 140 }} />
              </div>
              {nameErr && <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--status-negative-text)' }}>{nameErr}</div>}
              <div style={{ display: 'flex', gap: SPACE[2] }}>
                <Button variant="primary" onClick={saveName} disabled={savingName}>{savingName ? 'Saving…' : 'Save'}</Button>
                <Button variant="ghost" onClick={() => setEditingName(false)} disabled={savingName}>Cancel</Button>
              </div>
            </div>
          )}
          {status === 'pending' && (
            <div style={{ marginTop: SPACE[3] }}>
              <AlertStrip severity="warning">
                <b>Waiting on approval.</b> You'll get an email when your account is reviewed — usually within a day. Until then, content stays locked.
              </AlertStrip>
            </div>
          )}
          {status === 'rejected' && (
            <div style={{ marginTop: SPACE[3] }}>
              <AlertStrip severity="negative">
                <b>Your request wasn't approved.</b> If you think this is a mistake, contact support and we'll take another look.
              </AlertStrip>
            </div>
          )}
        </div>

        {/* Connected accounts — subscriber web only (admin has no Flex connection / Settings route) */}
        {!isAdmin && (
          <div style={card}>
            <div style={{ ...sectionLabel, marginBottom: SPACE[2.5] }}>Connected accounts</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2.5], flexWrap: 'wrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: RADIUS.full, background: ibkrConnected ? 'var(--acc)' : 'var(--t3)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>Interactive Brokers</span>
                <span style={{ display: 'block', fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>
                  {ibkrConnected
                    ? (ibkrSyncedAt ? `Connected · synced ${fmtDateTime(ibkrSyncedAt)}` : 'Connected')
                    : 'Not connected'}
                </span>
              </span>
              <Button variant="secondary" onClick={() => navigate('/settings')} style={{ minHeight: 36 }}>Manage</Button>
            </div>
          </div>
        )}

        {/* Preferences */}
        <div style={card}>
          <div style={{ ...sectionLabel, marginBottom: SPACE[1] }}>Preferences</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...prefRow, borderBottom: '1px solid var(--bsub)' }}>
              {prefLabel('Default Stock Picks tab', 'Which sub-tab opens first on Stock Picks.')}
              <select
                value={coercePicksTab(defaultTab)}
                onChange={(e) => setDefaultTab(e.target.value as PicksTab)}
                style={{
                  height: 34, padding: `0 ${SPACE[2]}px`, fontSize: FONT_SIZE.sm, borderRadius: RADIUS.md,
                  border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)', fontFamily: 'inherit',
                }}
              >
                {PICKS_TABS.map((t) => <option key={t} value={t}>{PICKS_TAB_LABELS[t]}</option>)}
              </select>
            </div>

            <div style={{ ...prefRow, borderBottom: '1px solid var(--bsub)' }}>
              {prefLabel('Theme', 'Light or dark.')}
              <span style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: RADIUS.md, overflow: 'hidden' }}>
                {(['light', 'dark'] as Theme[]).map((opt, i) => (
                  <button
                    key={opt}
                    onClick={() => setTheme(opt)}
                    style={{
                      padding: `${SPACE[1.5]}px ${SPACE[3]}px`, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
                      border: 'none', borderLeft: i > 0 ? '1px solid var(--bsub)' : 'none', cursor: 'pointer',
                      background: theme === opt ? 'var(--acc)' : 'var(--surface)',
                      color: theme === opt ? 'var(--text-inverse)' : 'var(--t2)',
                    }}
                  >
                    {opt === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </span>
            </div>

            <div style={prefRow}>
              {prefLabel('Show dollar amounts', 'Off shows percentages only, everywhere — for screen-sharing.')}
              <button
                onClick={toggleMoney}
                role="switch"
                aria-checked={showMoney}
                aria-label="Show dollar amounts"
                style={{
                  width: 44, height: 26, borderRadius: RADIUS.full, border: '1px solid var(--border)',
                  background: showMoney ? 'var(--acc)' : 'var(--bsub)', cursor: 'pointer', position: 'relative', padding: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: showMoney ? 21 : 2, width: 20, height: 20, borderRadius: RADIUS.full,
                  background: 'var(--text-inverse)', boxShadow: SHADOW.card, transition: 'left 0.15s',
                }} />
              </button>
            </div>
          </div>
        </div>

        {/* Account */}
        <div style={card}>
          <div style={{ ...sectionLabel, marginBottom: SPACE[2.5] }}>Account</div>
          <div style={{ display: 'flex', gap: SPACE[2], flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={changePassword} style={{ minHeight: 44 }}>Change password</Button>
            <Button variant="secondary" onClick={signOut} style={{ minHeight: 44 }}>Sign out</Button>
            <Button variant="destructive" onClick={requestDeletion} style={{ minHeight: 44, marginLeft: 'auto' }}>Delete account…</Button>
          </div>
          {pwMsg && <div style={{ marginTop: SPACE[2.5], fontSize: FONT_SIZE.xs, color: 'var(--t2)' }}>{pwMsg}</div>}
        </div>

      </div>
    </div>
  );
}
