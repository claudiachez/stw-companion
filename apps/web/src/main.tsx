import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, AppCapabilitiesProvider } from '@stw/ui';
import './lib/supabase'; // side-effect: creates + injects the Supabase client
import App from './App';
import './index.css';

const queryClient = createQueryClient();

// Subscriber shell: no admin capabilities. Finnhub key injected from web env.
const capabilities = {
  isAdmin: false,
  canEdit: false,
  showIbkrBadge: false,
  finnhubKey: import.meta.env.VITE_FINNHUB_KEY as string | undefined,
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
