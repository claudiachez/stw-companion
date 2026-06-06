import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useSession } from './useSession';
import { usePreferencesSync } from '../preferences/usePreferencesSync';

export function AuthGuard() {
  useSession();
  usePreferencesSync(); // load + persist per-user theme & Stock Picks filters
  const { session, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="w-8 h-8 border-2 border-acc border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
