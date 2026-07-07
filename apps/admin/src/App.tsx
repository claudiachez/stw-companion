import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard, LoginPage, Layout, ProfilePage, PicksView, SignalsView, MacroView, DesignSystemGallery, type NavItem } from '@stw/ui';
import { UsersPage } from './features/users/UsersPage';
import { ConfigPage } from './features/manage/ConfigPage';
import { LimitsPage } from './features/limits/LimitsPage';
import { IbkrBadge } from './features/ibkr/IbkrBadge';

const ADMIN_NAV: NavItem[] = [
  { to: '/picks',   label: 'Stock Picks', short: 'Picks'   },
  { to: '/signals', label: 'GEX Signals', short: 'Signals' },
  { to: '/macro',   label: 'Macro',       short: 'Macro'   },
  { to: '/limits',  label: 'Limits',      short: 'Limits'  },
  { to: '/users',   label: 'Users',       short: 'Users'   },
  { to: '/config',  label: 'Config',      short: 'Config'  },
  // Internal design-system review route (plans/stw-design-system.md Phase 3) — not a
  // subscriber-facing feature; a plain route since neither app has Storybook.
  { to: '/design-system', label: 'Design System', short: 'Design' },
];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGuard />}>
          <Route element={<Layout navItems={ADMIN_NAV} title="STW Admin" headerSlot={<IbkrBadge />} />}>
            <Route index element={<Navigate to="/picks" replace />} />
            <Route path="/picks" element={<PicksView />} />
            <Route path="/signals" element={<SignalsView />} />
            <Route path="/macro"   element={<MacroView />} />
            <Route path="/limits"  element={<LimitsPage />} />
            <Route path="/users"   element={<UsersPage />} />
            <Route path="/config"  element={<ConfigPage />} />
            <Route path="/design-system" element={<DesignSystemGallery />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
