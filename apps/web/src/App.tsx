import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard, LoginPage, Layout, ProfilePage, MacroView, type NavItem } from '@stw/ui';
import { PicksRoute } from './features/picks/PicksRoute';
import { SignalsRoute } from './features/signals/SignalsRoute';
import { PortfolioRoute } from './features/portfolio/PortfolioRoute';
import { SettingsPage } from './features/settings/SettingsPage';

const WEB_NAV: NavItem[] = [
  { to: '/picks',     label: 'Stock Picks', short: 'Picks'     },
  { to: '/signals',   label: 'GEX Signals', short: 'Signals'   },
  { to: '/macro',     label: 'Macro',       short: 'Macro'     },
  { to: '/portfolio', label: 'My Portfolio', short: 'Portfolio' },
];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGuard />}>
          <Route element={<Layout navItems={WEB_NAV} showSettingsLink />}>
            <Route index element={<Navigate to="/picks" replace />} />
            <Route path="/picks"     element={<PicksRoute />} />
            <Route path="/signals"   element={<SignalsRoute />} />
            <Route path="/macro"     element={<MacroView />} />
            <Route path="/portfolio" element={<PortfolioRoute />} />
            <Route path="/profile"   element={<ProfilePage />} />
            <Route path="/settings"  element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
