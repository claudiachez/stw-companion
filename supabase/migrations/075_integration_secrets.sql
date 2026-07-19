-- 075: integration_secrets — admin-managed secret store (Item 3 follow-up:
-- manage the Discord alert bot token from the admin UI, so swapping the test bot
-- for the production one is a UI action, not a Netlify env edit).
--
-- Deliberately SEPARATE from app_config: app_config is `value numeric` AND world-readable
-- (`select ... to authenticated using (true)`), so it must NEVER hold a secret. This table
-- is text-valued and readable + writable ONLY by the editor (JWT email gate, same operator
-- identity as app_config's WRITE policy) — no subscriber can read it. The drawdown-alert
-- cron reads it with the service role (which bypasses RLS).
--
-- First key: `discord_bot_token`. The token is entered by the admin in the UI (write-only —
-- the value is never rendered back); this migration seeds no value. Run in the SQL editor
-- or via apply_migration.

create table if not exists public.integration_secrets (
  key        text        not null primary key,
  value      text,
  updated_at timestamptz not null default now()
);

comment on table public.integration_secrets is
  'Admin-managed secrets (e.g. discord_bot_token). Text-valued and editor-only (RLS) — unlike app_config, NEVER world-readable. Read by crons via the service role; the UI writes it write-only (never displays the value).';

alter table public.integration_secrets enable row level security;
drop policy if exists "integration_secrets_admin_all" on public.integration_secrets;
create policy "integration_secrets_admin_all" on public.integration_secrets
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');
