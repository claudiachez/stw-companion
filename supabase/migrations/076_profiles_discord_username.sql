-- 076: profiles.discord_username — display handle for the Discord DM link (Item 3).
--
-- The subscriber enters their Discord USERNAME (friendlier, matches how Whop shows it), but
-- Discord DMs need the numeric user ID. The `discord-link` fn resolves the username to an ID
-- by searching the bot's shared server and stores BOTH: discord_user_id (076-prior 074 — the
-- id the bot DMs) + discord_username (this column — the handle we show back). Interim until
-- the Whop integration feeds both automatically (see docs/decisions.md "flow through WHOP").
--
-- Nullable, additive. Run in the SQL editor or via apply_migration.

alter table public.profiles
  add column if not exists discord_username text;

comment on column public.profiles.discord_username is
  'Display Discord handle the user linked; resolved to profiles.discord_user_id (the DM target) by the discord-link fn. Interim until Whop feeds the linkage.';
