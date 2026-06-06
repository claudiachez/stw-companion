import { getSupabase } from '../lib/supabase';
import type { Theme } from '../store/theme';
import type { PicksFilters } from '../features/picks/useFilters';

// Per-user UI preferences stored in profiles.preferences (jsonb).
export interface UserPreferences {
  theme?: Theme;
  picksFilters?: Partial<PicksFilters>;
}

export async function loadPreferences(userId: string): Promise<UserPreferences | null> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) { console.warn('loadPreferences failed:', error.message); return null; }
  const prefs = data?.preferences as UserPreferences | null | undefined;
  return prefs && typeof prefs === 'object' ? prefs : null;
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  // SECURITY DEFINER RPC — updates only the caller's own preferences column.
  const { error } = await getSupabase().rpc('set_my_preferences', { prefs });
  if (error) console.warn('savePreferences failed:', error.message);
}
