/**
 * discord-link — resolve a subscriber's Discord USERNAME to their numeric user ID and link
 * it, so drawdown-alert DMs can reach them (Item 3, plans/20260719...).
 *
 * Why a function: Discord's DM API needs the numeric id, never a username, and resolving a
 * username → id requires the BOT TOKEN (an admin-only secret that must never touch the
 * browser). So the browser sends just the username + the user's Supabase JWT; this fn (with
 * the service role + the stored bot token) searches the bot's shared server for that handle,
 * resolves the id, and writes BOTH profiles.discord_user_id (DM target) + discord_username
 * (display) for the authenticated user only (id taken from the JWT, never the body).
 *
 * Interim: once the Whop integration lands it feeds the id+username directly and this fn
 * becomes redundant (docs/decisions.md "flow through WHOP").
 *
 * Requires: integration_secrets.discord_bot_token + discord_guild_id (set in admin Config),
 * the bot IN that server, and the GUILD_MEMBERS privileged intent enabled for the app.
 * Conventions: direct fetch() (no supabase-js / discord SDK), `.trim()` env. Web-only.
 */
import type { Handler } from '@netlify/functions';

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Decode the Supabase JWT locally to get the caller's user id (`sub`). We NEVER trust a
// user_id from the request body — the token is the identity.
function jwtSub(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as Record<string, unknown>;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch { return null; }
}

async function sbGet<T>(url: string, key: string, path: string): Promise<T[]> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json() as Promise<T[]>;
}
async function sbPatch(url: string, key: string, path: string, row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${(await res.text()).slice(0, 160)}`);
}

interface DiscordMember { user?: { id: string; username: string } }

export const handler: Handler = async (event) => {
  const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !serviceKey) return json(500, { error: 'Server misconfigured' });

  const authz = (event.headers.authorization ?? event.headers.Authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  const userId = authz ? jwtSub(authz) : null;
  if (!userId) return json(401, { error: 'Not authenticated' });

  let username = '';
  try { username = String((JSON.parse(event.body ?? '{}') as { username?: string }).username ?? '').trim(); } catch { /* empty */ }

  // Empty username = unlink.
  if (!username) {
    try {
      await sbPatch(url, serviceKey, `profiles?user_id=eq.${userId}`, { discord_user_id: null, discord_username: null });
      return json(200, { ok: true, linked: false });
    } catch (e) { return json(500, { error: e instanceof Error ? e.message : String(e) }); }
  }

  // Bot token (admin UI value wins, else env) + the server to search.
  let botToken = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
  let guildId = '';
  try {
    const secrets = await sbGet<{ key: string; value: string | null }>(url, serviceKey, 'integration_secrets?key=in.(discord_bot_token,discord_guild_id)&select=key,value');
    const dbToken = (secrets.find((s) => s.key === 'discord_bot_token')?.value ?? '').trim();
    if (dbToken) botToken = dbToken;
    guildId = (secrets.find((s) => s.key === 'discord_guild_id')?.value ?? '').trim();
  } catch { /* fall back to env token; guildId stays empty → handled below */ }

  if (!botToken || !guildId) return json(200, { ok: false, reason: 'not_configured' });

  // Search the server's members for the handle. Requires the bot in the guild + the
  // GUILD_MEMBERS privileged intent.
  let members: DiscordMember[];
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(username)}&limit=100`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) return json(200, { ok: false, reason: 'search_failed', detail: `${res.status} ${(await res.text()).slice(0, 160)}` });
    members = (await res.json()) as DiscordMember[];
  } catch (e) { return json(200, { ok: false, reason: 'search_failed', detail: e instanceof Error ? e.message : String(e) }); }

  // Exact handle match (case-insensitive) — the search is a prefix match on username/nick,
  // so we filter to the real unique username to avoid linking the wrong person.
  const wanted = username.replace(/^@/, '').toLowerCase();
  const match = members.find((m) => m.user && m.user.username.toLowerCase() === wanted);
  if (!match?.user) return json(200, { ok: false, reason: 'not_found' });

  try {
    await sbPatch(url, serviceKey, `profiles?user_id=eq.${userId}`, {
      discord_user_id: match.user.id, discord_username: match.user.username,
    });
  } catch (e) { return json(500, { error: e instanceof Error ? e.message : String(e) }); }

  return json(200, { ok: true, linked: true, username: match.user.username });
};
