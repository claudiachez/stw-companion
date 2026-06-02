import { createClient } from '@supabase/supabase-js';
import { setSupabaseClient } from '@stw/ui';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Inject the admin client into @stw/ui so shared data hooks use this app's
// credentials. This module is imported at startup (via main.tsx) before any
// shared query runs. RLS still restricts all writes to cc@claudiachez.com.
setSupabaseClient(supabase);
