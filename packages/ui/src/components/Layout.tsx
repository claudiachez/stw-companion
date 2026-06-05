import { useState, useRef, useEffect, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';

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

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

// ── STW logo (mic + green arrow) ─────────────────────────────
function STWLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Green arrow: lower-left to upper-right (behind mic) */}
      <line x1="8" y1="80" x2="58" y2="18" stroke="#22c55e" strokeWidth="6" strokeLinecap="round"/>
      <polyline points="53,12 68,10 66,25" stroke="#22c55e" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Mic base + stand */}
      <line x1="31" y1="78" x2="55" y2="78" stroke="#c8c8c8" strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="43" y1="68" x2="43" y2="78" stroke="#c8c8c8" strokeWidth="3" strokeLinecap="round"/>
      <path d="M27 56 Q27 68 43 68 Q59 68 59 56" stroke="#c8c8c8" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      {/* Mic capsule */}
      <rect x="33" y="16" width="20" height="42" rx="10" fill="#e2e2e2"/>
      <rect x="33" y="16" width="20" height="42" rx="10" fill="none" stroke="#b4b4b4" strokeWidth="1.5"/>
      {/* Grille lines */}
      <line x1="35" y1="26" x2="51" y2="26" stroke="#aaaaaa" strokeWidth="0.9"/>
      <line x1="35" y1="32" x2="51" y2="32" stroke="#aaaaaa" strokeWidth="0.9"/>
      <line x1="35" y1="38" x2="51" y2="38" stroke="#aaaaaa" strokeWidth="0.9"/>
      <line x1="35" y1="44" x2="51" y2="44" stroke="#aaaaaa" strokeWidth="0.9"/>
      <line x1="35" y1="50" x2="51" y2="50" stroke="#aaaaaa" strokeWidth="0.9"/>
    </svg>
  );
}

export interface NavItem {
  to: string;
  label: string;
  short: string;
}

const DEFAULT_NAV: NavItem[] = [
  { to: '/picks',   label: 'Stock Picks', short: 'Picks'   },
  { to: '/signals', label: 'GEX Signals', short: 'Signals' },
];

interface LayoutProps {
  /** Nav tabs shown in the header. Defaults to Picks + Signals. */
  navItems?: NavItem[];
  /** Optional content rendered in the header, left of the menu button (e.g. IBKR badge). */
  headerSlot?: ReactNode;
  /** Label shown above the user email in the menu (e.g. "STW Admin"). */
  title?: string;
  /** Show a Settings item in the hamburger menu (web app only). */
  showSettingsLink?: boolean;
}

// ── Layout ───────────────────────────────────────────────────
export function Layout({ navItems = DEFAULT_NAV, headerSlot, title = 'STW Companion', showSettingsLink = false }: LayoutProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { theme, toggle } = useThemeStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function signOut() {
    setMenuOpen(false);
    await getSupabase().auth.signOut();
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
            fontWeight: 700, fontSize: 13, letterSpacing: '0.06em',
            color: 'var(--text)', textTransform: 'uppercase',
            marginLeft: 6, marginRight: 10, flexShrink: 0,
          }}
            className="hidden sm:block"
          >
            {title}
          </span>

          {/* Separator */}
          <div style={{ width: 1, height: 18, background: 'var(--border)', marginRight: 6, flexShrink: 0 }} className="hidden sm:block" />

          {/* Nav tabs */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {navItems.map(({ to, label, short }) => (
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

        {/* Right: optional header slot + hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {headerSlot}
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
                  style={{ ...menuItemStyle, borderBottom: showSettingsLink ? 'none' : '1px solid var(--bsub)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <span style={{ color: 'var(--t3)' }}><UserIcon /></span>
                  <span>Profile</span>
                </button>

                {/* Settings (web only) */}
                {showSettingsLink && (
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                    style={{ ...menuItemStyle, borderBottom: '1px solid var(--bsub)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                  >
                    <span style={{ color: 'var(--t3)' }}><SettingsIcon /></span>
                    <span>Settings</span>
                  </button>
                )}

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
