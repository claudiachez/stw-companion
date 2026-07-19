-- 074: profiles.discord_user_id — subscriber Discord linking for drawdown-alert DMs
-- (Item 3, plans/20260719_drawdown-protection-overhaul.md).
--
-- The alert cron can DM a user their drawdown alerts via a Discord bot. Discord only lets a
-- bot DM someone it shares a server with, and we need to know WHICH Discord user maps to this
-- app account — that mapping is this column. Distinct from `traders.discord_user_id` (that's
-- STW's own ID, used INBOUND to ingest their commentary); this is the SUBSCRIBER's own ID,
-- used OUTBOUND to reach them.
--
-- For now the user pastes their Discord user ID in Settings (Developer Mode → right-click →
-- Copy User ID). A Discord OAuth "identify" link flow is the eventual productionization — it
-- would populate this same column, so nothing downstream changes.
--
-- Nullable, additive, no default — a user with no linked Discord simply gets no DM (email
-- still works). Advisory/display-only feature. Run in the SQL editor or via apply_migration.

alter table public.profiles
  add column if not exists discord_user_id text;

comment on column public.profiles.discord_user_id is
  'The subscriber''s own Discord user ID (OUTBOUND — the alert bot DMs this id). Distinct from traders.discord_user_id (STW''s id, used inbound for commentary ingestion). Null = no Discord DMs; email still works.';
