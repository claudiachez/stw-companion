import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, AppCapabilitiesProvider, type AppCapabilities } from '@stw/ui';
import './lib/supabase'; // side-effect: creates + injects the Supabase client
import App from './App';
import './index.css';

const queryClient = createQueryClient();

// Admin shell: full capabilities, no paywall. RLS still restricts writes to the
// admin account. onEditHolding is wired by App (it owns the edit-form state).
const capabilities: AppCapabilities = {
  isAdmin: true,
  canEdit: true,
  showIbkrBadge: true,
  finnhubKey: import.meta.env.VITE_FINNHUB_KEY as string | undefined,
  twelveDataKey: import.meta.env.VITE_TWELVEDATA_KEY as string | undefined,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppCapabilitiesProvider value={capabilities}>
        <App />
      </AppCapabilitiesProvider>
    </QueryClientProvider>
  </StrictMode>,
);
