import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard, LoginPage, Layout, ProfilePage } from '@stw/ui';
import { PicksRoute } from './features/picks/PicksRoute';
import { SignalsRoute } from './features/signals/SignalsRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGuard />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/picks" replace />} />
            <Route path="/picks" element={<PicksRoute />} />
            <Route path="/signals" element={<SignalsRoute />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
