import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import { useDataStatus, getFreshness } from '../hooks/useDataStatus';

// ── SVG icon set ────────────────────────────────────────────
function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.2" y1="4.2" x2="6.3" y2="6.3" />
      <line x1="17.7" y1="17.7" x2="19.8" y2="19.8" />
      <line x1="19.8" y1="4.2" x2="17.7" y2="6.3" />
      <line x1="6.3" y1="17.7" x2="4.2" y2="19.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

// ── STW mic logo ─────────────────────────────────────────────
function STWLogo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="7" fill="#0d1f0d" />
      {/* Mic body */}
      <rect x="10" y="4" width="12" height="16" rx="6" stroke="#22c55e" strokeWidth="2" />
      {/* Mic stand arc */}
      <path d="M6 15 Q6 26 16 26 Q26 26 26 15" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Stand + base */}
      <line x1="16" y1="26" x2="16" y2="29" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
      <line x1="11" y1="29" x2="21" y2="29" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── IBKR / data freshness badge ──────────────────────────────
const ET = { timeZone: 'America/New_York' };

function freshnessColor(f: string) {
  if (f === 'fresh') return '#22c55e';
  if (f === 'aging') return '#f59e0b';
  return '#ef4444';
}

function fmtAge(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function IbkrBadge() {
  const { data: lastUpdated, isFetching, refetch } = useDataStatus();
  const queryClient = useQueryClient();
  const freshness = getFreshness(lastUpdated ?? null);
  const color = freshnessColor(freshness);
  const syncing = isFetching;
  const clickable = !syncing && freshness !== 'fresh';
  const label = syncing ? 'Syncing…' : (lastUpdated ? fmtAge(lastUpdated) : '—');
  const tooltip = syncing
    ? 'Refreshing data…'
    : lastUpdated
      ? `Last sync: ${lastUpdated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...ET })}${clickable ? ' — click to re-sync' : ''}`
      : 'No sync data';

  async function handleSync() {
    if (!clickable) return;
    await queryClient.invalidateQueries({ queryKey: ['holdings'] });
    await refetch();
  }

  return (
    <button
      onClick={handleSync}
      title={tooltip}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 9px', borderRadius: 5,
        border: `1px solid ${color}${clickable ? '50' : '28'}`,
        background: `${color}${clickable ? '18' : '0f'}`,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => { if (clickable) (e.currentTarget as HTMLElement).style.background = `${color}28`; }}
      onMouseLeave={(e) => { if (clickable) (e.currentTarget as HTMLElement).style.background = `${color}18`; }}
    >
      <div style={{
        width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
        animation: syncing ? 'ibkr-pulse 1s ease-in-out infinite' : 'none',
      }} />
      <span style={{ fontSize: 11, color: 'var(--t2)', whiteSpace: 'nowrap' }}>IBKR</span>
      <span style={{ fontSize: 11, color, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

// ── Nav ──────────────────────────────────────────────────────
const NAV = [
  { to: '/picks',   label: 'Stock Picks', short: 'Picks'   },
  { to: '/signals', label: 'GEX Signals', short: 'Signals' },
];

// ── Layout ───────────────────────────────────────────────────
export function Layout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { theme, toggle } = useThemeStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function signOut() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    navigate('/login');
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const menuItemStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'none', border: 'none', cursor: 'pointer',
    textAlign: 'left', color: 'var(--t2)', fontSize: 13,
    transition: 'background 0.15s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' }}>
      <header style={{
        flexShrink: 0, height: 46,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 0,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        position: 'relative', zIndex: 10,
      }}>

        {/* Left: logo + name + nav tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          <STWLogo />
          <span style={{
            fontWeight: 800, fontSize: 13, letterSpacing: '0.1em',
            color: 'var(--text)', textTransform: 'uppercase',
            marginLeft: 6, marginRight: 10, flexShrink: 0,
          }}
            className="hidden sm:block"
          >
            STW
          </span>

          {/* Separator */}
          <div style={{ width: 1, height: 18, background: 'var(--border)', marginRight: 6, flexShrink: 0 }} className="hidden sm:block" />

          {/* Nav tabs */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {NAV.map(({ to, label, short }) => (
              <NavLink
                key={to}
                to={to}
                style={({ isActive }) => ({
                  padding: '4px 10px',
                  borderRadius: 5,
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  textDecoration: 'none',
                  color: isActive ? 'var(--acc)' : 'var(--t2)',
                  background: isActive ? 'var(--s2)' : 'none',
                  transition: 'color 0.15s, background 0.15s',
                  whiteSpace: 'nowrap',
                  minHeight: 36,
                  display: 'flex',
                  alignItems: 'center',
                })}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.color = 'var(--text)';
                  el.style.background = 'var(--s2)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  const active = el.getAttribute('aria-current') === 'page';
                  el.style.color = active ? 'var(--acc)' : 'var(--t2)';
                  el.style.background = active ? 'var(--s2)' : 'none';
                }}
              >
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{short}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right: IBKR badge + hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <IbkrBadge />

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="hdr-btn"
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, border: '1px solid var(--border)',
                background: menuOpen ? 'var(--s2)' : 'none',
                cursor: 'pointer', color: 'var(--t2)',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--s2)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                if (!menuOpen) (e.currentTarget as HTMLElement).style.background = 'none';
                (e.currentTarget as HTMLElement).style.color = 'var(--t2)';
              }}
            >
              <MenuIcon />
            </button>

            {menuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, minWidth: 210,
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                overflow: 'hidden', zIndex: 100,
              }}>
                {/* User email */}
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bsub)' }}>
                  <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                    Signed in as
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.email}
                  </div>
                </div>

                {/* Theme toggle */}
                <button
                  onClick={toggle}
                  style={{ ...menuItemStyle, borderBottom: '1px solid var(--bsub)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <span style={{ color: 'var(--acc)' }}>{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</span>
                  <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>

                {/* Profile */}
                <button
                  onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                  style={{ ...menuItemStyle, borderBottom: '1px solid var(--bsub)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <span style={{ color: 'var(--t3)' }}><UserIcon /></span>
                  <span>Profile</span>
                </button>

                {/* Sign out */}
                <button
                  onClick={signOut}
                  style={{ ...menuItemStyle, color: '#ef4444' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <LogOutIcon />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
