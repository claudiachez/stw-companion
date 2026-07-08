-- Adds a separate, typically-tighter single-name cap for OPTIONS exposure.
-- Options carry more risk per dollar (leverage, time decay, pin/expiry risk), so a
-- subscriber can limit any one underlying's option exposure below the overall
-- max_position_pct. Defaults to 5% (vs the 10% general position default). Flag-only,
-- like every other limit in this engine — nothing here blocks or places a trade.
alter table public.risk_config
  add column if not exists max_option_position_pct numeric not null default 5;
