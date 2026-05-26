import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';
import { useThemeStore } from '../../store/theme';

const NAV = [
  { to: '/picks', label: 'STW Stock Picks' },
  { to: '/signals', label: 'Graddox GEX Signals' },
];

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' }}>
      <header style={{
        flexShrink: 0, height: 44,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        position: 'relative', zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="#111111" />
            <path d="M10 24 L16 10 L22 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '0.08em', color: 'var(--text)', textTransform: 'uppercase' }}
            className="hidden sm:block">
            STW Companion
          </span>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                padding: '4px 10px',
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 500,
                textDecoration: 'none',
                color: isActive ? 'var(--acc)' : 'var(--t2)',
                background: isActive ? 'var(--s2)' : 'none',
                transition: 'color 0.15s, background 0.15s',
              })}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                if (!el.classList.contains('active')) {
                  el.style.color = 'var(--text)';
                  el.style.background = 'var(--s2)';
                }
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                if (!el.classList.contains('active')) {
                  el.style.color = 'var(--t2)';
                  el.style.background = 'none';
                }
              }}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Hamburger */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, border: '1px solid var(--border)', background: menuOpen ? 'var(--s2)' : 'none',
              cursor: 'pointer', color: 'var(--t2)', fontSize: 16, transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
            onMouseLeave={(e) => { if (!menuOpen) (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            ☰
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, minWidth: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              overflow: 'hidden', zIndex: 100,
            }}>
              {/* User email */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bsub)' }}>
                <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Signed in as</div>
                <div style={{ fontSize: 11, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </div>
              </div>

              {/* Theme toggle */}
              <button
                onClick={toggle}
                style={{
                  width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: 'var(--t2)', fontSize: 12, borderBottom: '1px solid var(--bsub)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <span style={{ fontSize: 14 }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>

              {/* Profile link */}
              <button
                onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                style={{
                  width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: 'var(--t2)', fontSize: 12, borderBottom: '1px solid var(--bsub)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <span style={{ fontSize: 14 }}>👤</span>
                <span>Profile</span>
              </button>

              {/* Sign out */}
              <button
                onClick={signOut}
                style={{
                  width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: '#ef4444', fontSize: 12,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <span style={{ fontSize: 14 }}>→</span>
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
