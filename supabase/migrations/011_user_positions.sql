-- 011_user_positions.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- Adds IBKR Flex Query credentials to profiles and a per-user positions table.
-- RLS ensures each subscriber sees only their own rows.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ibkr_flex_token text,
  ADD COLUMN IF NOT EXISTS ibkr_query_id   text;

CREATE TABLE IF NOT EXISTS public.user_positions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  underlying         text        NOT NULL,   -- clean ticker (AAPL, not the OCC symbol)
  asset_class        text        NOT NULL,   -- 'STK' | 'OPT'
  quantity           numeric,
  avg_cost           numeric,                -- costBasisPrice per share/contract
  mark_price         numeric,
  unrealized_pnl     numeric,                -- fifoPnlUnrealized in USD
  unrealized_pnl_pct numeric,                -- computed: fifoPnlUnrealized / abs(costBasisMoney) * 100
  -- Options-specific (NULL for STK rows)
  strike             numeric,
  put_call           text        CHECK (put_call IN ('C', 'P') OR put_call IS NULL),
  expiry             text,                   -- YYYYMMDD
  multiplier         integer     DEFAULT 1,
  -- IBKR contract ID — unique per user, used as upsert / lookup key
  conid              text        NOT NULL,
  last_synced_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, conid)
);

ALTER TABLE public.user_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_positions_all" ON public.user_positions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
