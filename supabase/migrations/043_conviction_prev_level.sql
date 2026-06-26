-- 043_conviction_prev_level.sql
-- Record the conviction level a comment moved FROM, so the app never has to reverse-engineer
-- conviction changes by diffing comment rows (which is unreliable when the comment history is
-- sparse or stale). The routines own conviction; when they write a conviction_comments row they
-- now also stamp the prior level, making the routine the single source of truth for the delta.
--
-- Semantics:
--   prev_conviction_level = holdings.conviction BEFORE this comment's change.
--   - reaffirmation / commentary-only → prev_conviction_level = conviction_level (no move)
--   - upgrade  → prev_conviction_level < conviction_level
--   - downgrade→ prev_conviction_level > conviction_level
--   - null     → unknown / not recorded (app falls back: new position vs. reaffirmed)

alter table public.conviction_comments
  add column if not exists prev_conviction_level integer;
comment on column public.conviction_comments.prev_conviction_level is
  'Conviction level BEFORE this comment''s change (= conviction_level when reaffirmed; null = unrecorded). Lets the app render prev→current directly instead of diffing rows.';
