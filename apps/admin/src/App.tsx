import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard, LoginPage, Layout, ProfilePage, PicksView, SignalsView, type NavItem } from '@stw/ui';
import { UsersPage } from './features/users/UsersPage';
import { IbkrBadge } from './features/ibkr/IbkrBadge';

const ADMIN_NAV: NavItem[] = [
  { to: '/picks',   label: 'Stock Picks', short: 'Picks'   },
  { to: '/signals', label: 'GEX Signals', short: 'Signals' },
  { to: '/users',   label: 'Users',       short: 'Users'   },
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
            <Route path="/users" element={<UsersPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
