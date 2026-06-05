import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';

export function LoginPage() {
  const { session } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to="/picks" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      const supabase = getSupabase();
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) setError(error.message);
        else setInfo('Check your email for a confirmation link.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="mb-4">
            <rect width="56" height="56" rx="12" fill="#111111" />
            <path d="M18 40 L28 18 L38 40" fill="none" stroke="#22c55e" strokeWidth="3.5" strokeLinejoin="round" />
          </svg>
          <h1 className="font-sans text-2xl font-bold text-text">STW Companion</h1>
          <p className="text-t2 text-sm mt-1">Stock Talk Weekly</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6">
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 bg-s2 border border-border rounded-lg px-4 py-2.5 text-sm text-text hover:border-t2 transition-colors mb-4"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M17.64 9.2a10.34 10.34 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z" fill="#4285F4" />
              <path d="M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.92-2.26a5.43 5.43 0 0 1-8.07-2.85H.96v2.34A9 9 0 0 0 9 18z" fill="#34A853" />
              <path d="M3.97 10.71a5.38 5.38 0 0 1 0-3.42V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.34z" fill="#FBBC05" />
              <path d="M9 3.58a4.86 4.86 0 0 1 3.44 1.35l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.34A5.36 5.36 0 0 1 9 3.58z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-t3 text-xs">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="bg-s2 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-t3 focus:outline-none focus:border-acc"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="bg-s2 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-t3 focus:outline-none focus:border-acc"
            />

            {error && <p className="text-c1 text-xs">{error}</p>}
            {info && <p className="text-acc text-xs">{info}</p>}

            <button
              type="submit"
              disabled={loading}
              className="bg-acc text-black font-semibold rounded-lg px-4 py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
            className="w-full text-center text-t2 text-xs mt-4 hover:text-text transition-colors"
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
