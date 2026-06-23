import { getSupabase } from '../../lib/supabase';

// Canonical trader names (rows seeded in migration 022). The app manages STW's book —
// every client-side write (holdings transactions, conviction notes) is stamped with STW's
// id — and reads Graddox's GEX signals. trader_id is NOT NULL on those tables after
// migration 026, so writes must resolve it.
export const STW = 'STW';
export const GRADDOX = 'Graddox';

// Resolve a trader's UUID by name, memoized for the session. Resolving by name (not a
// hardcoded UUID) keeps the same build working against any environment where the traders
// row is seeded (preview branch, prod).
const cache = new Map<string, Promise<string>>();

export function getTraderId(name: string): Promise<string> {
  let p = cache.get(name);
  if (!p) {
    p = (async () => {
      const { data, error } = await getSupabase()
        .from('traders')
        .select('id')
        .eq('name', name)
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    })();
    cache.set(name, p);
  }
  return p;
}
