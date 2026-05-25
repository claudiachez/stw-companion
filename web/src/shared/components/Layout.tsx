import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';

const NAV = [
  { to: '/picks', label: 'Picks' },
  { to: '/signals', label: 'Signals' },
  { to: '/profile', label: 'Profile' },
];

export function Layout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <header className="sticky top-0 z-10 bg-surface border-b border-border px-4 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="#111111" />
            <path d="M10 24 L16 10 L22 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
          <span className="font-display font-extrabold text-xl tracking-wide text-text uppercase hidden sm:block">STW Companion</span>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-s2 text-acc' : 'text-t2 hover:text-text hover:bg-s2'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="text-t3 text-xs hidden sm:block truncate max-w-[160px]">{user?.email}</span>
          <button
            onClick={signOut}
            className="text-t2 hover:text-text text-xs px-2 py-1 rounded border border-border hover:border-t2 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
