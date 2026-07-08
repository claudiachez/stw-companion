import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard, LoginPage, Layout, ProfilePage, PicksView, SignalsView, MacroView, DesignSystemGallery, type NavItem } from '@stw/ui';
import { UsersPage } from './features/users/UsersPage';
import { ConfigPage } from './features/manage/ConfigPage';
import { IbkrBadge } from './features/ibkr/IbkrBadge';

const ADMIN_NAV: NavItem[] = [
  { to: '/picks',   label: 'Stock Picks', short: 'Picks'   },
  { to: '/signals', label: 'GEX Signals', short: 'Signals' },
  { to: '/macro',   label: 'Macro',       short: 'Macro'   },
  { to: '/users',   label: 'Users',       short: 'Users'   },
  { to: '/config',  label: 'Config',      short: 'Config'  },
];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGuard />}>
          <Route element={<Layout navItems={ADMIN_NAV} title="STW Admin" headerSlot={<IbkrBadge />} showDesignSystemLink />}>
            <Route index element={<Navigate to="/picks" replace />} />
            <Route path="/picks" element={<PicksView />} />
            <Route path="/signals" element={<SignalsView />} />
            <Route path="/macro"   element={<MacroView />} />
            <Route path="/users"   element={<UsersPage />} />
            <Route path="/config"  element={<ConfigPage />} />
            {/* Internal design-system review gallery (plans/stw-design-system.md Phase 3) —
                not a subscriber-facing feature, so it lives in the account menu, not the nav bar. */}
            <Route path="/design-system" element={<DesignSystemGallery />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
