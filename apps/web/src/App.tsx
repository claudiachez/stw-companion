import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from './features/auth/AuthGuard';
import { LoginPage } from './features/auth/LoginPage';
import { Layout } from './shared/components/Layout';
import { PicksPage } from './features/picks/PicksPage';
import { SignalsPage } from './features/signals/SignalsPage';
import { ProfilePage } from './pages/ProfilePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGuard />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/picks" replace />} />
            <Route path="/picks" element={<PicksPage />} />
            <Route path="/signals" element={<SignalsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
