import type { SupabaseClient } from '@supabase/supabase-js';

// @stw/ui never creates the Supabase client or reads env. Each app builds its
// own client (from its own VITE_* keys) and injects it here at startup, so the
// shared package stays decoupled from any one project's credentials.
let client: SupabaseClient | null = null;

export function setSupabaseClient(c: SupabaseClient): void {
  client = c;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      'Supabase client not initialized — call setSupabaseClient() at app startup before any data hook runs.',
    );
  }
  return client;
}
