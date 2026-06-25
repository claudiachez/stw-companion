-- 042_dd_source_urls.sql
-- Source-message links for the Ticker Detail surfaces.
--
-- Each durable DD (the local Tickers DD/<TICKER>.md research file) and each conviction
-- comment originates from a specific Discord/stream message. We store that message URL so
-- the app can render an "open original message" icon — on the Highlight box (the DD source)
-- and on each Commentary row. The link points into the private STW Discord; access is gated
-- by Discord itself (a connected member sees the message, a non-member gets Discord's
-- no-access screen), in line with the membership-companion model. No RLS change.
--
-- Both columns are nullable: legacy comments and holdings without a DD file carry no URL,
-- and the icon only renders when the URL is present.

alter table public.holdings
  add column if not exists dd_source_url text;
comment on column public.holdings.dd_source_url is
  'Discord message URL of the DD source (the Tickers DD/<TICKER>.md "Source" link). Drives the Highlight-box "open original message" icon. Null = no DD file.';

alter table public.conviction_comments
  add column if not exists source_url text;
comment on column public.conviction_comments.source_url is
  'Discord/stream message URL this comment was drawn from. Drives the per-row "open original message" icon. Null for legacy/manual rows.';
