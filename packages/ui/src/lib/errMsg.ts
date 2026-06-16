// Extract a human-readable message from any thrown value. Supabase/PostgREST errors are plain
// objects ({ message, code, details, hint }) — not Error instances — so `String(e)` yields the
// useless "[object Object]". Pull `.message` when present.
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}
