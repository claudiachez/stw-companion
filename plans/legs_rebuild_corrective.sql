-- Legs rebuild — corrective data fix (generated from plans/legs_rebuild_spec.md)
-- Rebuilds legs + leg_transactions for STW from the 7-snapshot series + pre-redesign backup.
-- The 030 trigger derives entry/weight/status/exit/realized from the inserted transactions.
-- holding_transactions (the timeline) is NOT touched. Apply in the Supabase SQL editor.
-- Pre-5/1 closed tickers (DPRO/GLDD/GME/ITRI/PANL/SQQQ/THR) are intentionally left as-is.

begin;

-- 1) Wipe corrupted legs + leg_transactions for the 38 rebuilt tickers
delete from public.leg_transactions where leg_id in (
  select id from public.legs where trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b' and ticker in ('ADEA','AMKR','AMRC','AMSC','AMZN','ARKK','ARRY','AVAV','BB','BDC','BLDP','CRNC','CTS','CXDO','ENS','FIVN','FPS','GDYN','HII','HOOD','IRDM','KTOS','LEU','LUMN','MITK','NBIS','OSS','P','PLPC','RDCM','RNG','SHLS','SYNA','TE','TSLA','VIAV','VLN','VPG'));
delete from public.legs where trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b' and ticker in ('ADEA','AMKR','AMRC','AMSC','AMZN','ARKK','ARRY','AVAV','BB','BDC','BLDP','CRNC','CTS','CXDO','ENS','FIVN','FPS','GDYN','HII','HOOD','IRDM','KTOS','LEU','LUMN','MITK','NBIS','OSS','P','PLPC','RDCM','RNG','SHLS','SYNA','TE','TSLA','VIAV','VLN','VPG');

-- 2) Re-insert legs (structural) + opening/closing leg_transactions (trigger derives state)

-- ADEA
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('e2c42386-8190-405d-9a75-347f6af84dea', 'ADEA', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('e2c42386-8190-405d-9a75-347f6af84dea', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 30.1, 4.77, '2026-05-15T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('4b1b24da-9581-4b4b-b2ff-929f393d29cf', 'ADEA', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 35, 'CALL', '2026-09-18', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('4b1b24da-9581-4b4b-b2ff-929f393d29cf', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 2.74, 0.53, '2026-06-05T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('37c5e22c-f4b4-4d6d-aa88-fbbef0215267', 'ADEA', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 30, 'CALL', '2026-09-18', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('37c5e22c-f4b4-4d6d-aa88-fbbef0215267', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 3.58, NULL, '2026-05-15T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('37c5e22c-f4b4-4d6d-aa88-fbbef0215267', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 4.83, 0, 'PROFIT_TARGET', '2026-06-11T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('864ee4bb-6e00-44bd-bfbc-e3075d6ec165', 'ADEA', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 30, 'CALL', '2026-06-19', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('864ee4bb-6e00-44bd-bfbc-e3075d6ec165', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 1.5, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('864ee4bb-6e00-44bd-bfbc-e3075d6ec165', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 1.5, 0, 'PROFIT_TARGET', '2026-05-15T13:00:00-04:00');

-- AMKR
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('b7e299f8-5779-4d53-8ea4-ce79fc02bc5d', 'AMKR', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('b7e299f8-5779-4d53-8ea4-ce79fc02bc5d', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 26.35, 11.3, '2026-05-01T13:00:00-04:00');

-- AMRC
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('38dabaef-88c8-4362-8057-0040c4f081b7', 'AMRC', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 35, 'CALL', '2026-10-16', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('38dabaef-88c8-4362-8057-0040c4f081b7', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 4.59, NULL, '2026-05-15T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('38dabaef-88c8-4362-8057-0040c4f081b7', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 1.3, 0, 'THESIS_BROKEN', '2026-06-05T13:00:00-04:00');

-- AMSC
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('7fd6a6ac-3d19-4440-a149-451176f93f96', 'AMSC', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('7fd6a6ac-3d19-4440-a149-451176f93f96', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 41.22, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('7fd6a6ac-3d19-4440-a149-451176f93f96', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 41.58, 0, 'PROFIT_TARGET', '2026-06-05T13:00:00-04:00');

-- AMZN
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('103ae37f-066b-4c35-bb16-b9a84d027060', 'AMZN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('103ae37f-066b-4c35-bb16-b9a84d027060', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 88.93, 0.8, '2026-05-01T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('a305ced0-ee7b-426f-ad06-3d99734a3794', 'AMZN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 300, 'CALL', '2027-01-15', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('a305ced0-ee7b-426f-ad06-3d99734a3794', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 11.9, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('a305ced0-ee7b-426f-ad06-3d99734a3794', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 18.15, 0, 'PROFIT_TARGET', '2026-05-15T13:00:00-04:00');

-- ARKK
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('4f1dad58-801f-4785-8c10-6e8c123388d4', 'ARKK', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 70, 'PUT', '2026-06-18', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('4f1dad58-801f-4785-8c10-6e8c123388d4', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 0.83, 0.7, '2026-06-11T13:00:00-04:00');

-- ARRY
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('0f77e4b4-6340-42d8-8769-c956fc472421', 'ARRY', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 9, 'CALL', '2026-08-21', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('0f77e4b4-6340-42d8-8769-c956fc472421', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 1.54, NULL, '2026-06-05T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('0f77e4b4-6340-42d8-8769-c956fc472421', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 0.5, 0, 'THESIS_BROKEN', '2026-06-11T13:00:00-04:00');

-- AVAV
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('10eed2fa-a042-4d06-90d3-0a555acc1361', 'AVAV', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 175, 'CALL', '2026-09-18', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('10eed2fa-a042-4d06-90d3-0a555acc1361', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 31.9, NULL, '2026-05-08T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('10eed2fa-a042-4d06-90d3-0a555acc1361', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 15.25, 0, 'THESIS_BROKEN', '2026-05-15T13:00:00-04:00');

-- BB
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('422659cd-414a-48e1-8782-e7e592bb4134', 'BB', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 6, 'CALL', '2026-09-18', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('422659cd-414a-48e1-8782-e7e592bb4134', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 0.87, NULL, '2026-05-08T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('422659cd-414a-48e1-8782-e7e592bb4134', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 3.48, 0, 'PROFIT_TARGET', '2026-06-10T13:00:00-04:00');

-- BDC
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('279a07a5-ba4a-4725-91a4-bec27782b5e3', 'BDC', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('279a07a5-ba4a-4725-91a4-bec27782b5e3', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 125.85, 2.07, '2026-05-01T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('4093c4f8-cf1e-4df8-8903-39d5a74f52b5', 'BDC', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 120, 'CALL', '2026-09-18', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('4093c4f8-cf1e-4df8-8903-39d5a74f52b5', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 8.68, 0.23, '2026-06-05T13:00:00-04:00');

-- BLDP
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('f4bb793b-19e7-4c6c-a73a-8792ccd9fecf', 'BLDP', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 4, 'CALL', '2026-08-21', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('f4bb793b-19e7-4c6c-a73a-8792ccd9fecf', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 0.9, NULL, '2026-05-15T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('f4bb793b-19e7-4c6c-a73a-8792ccd9fecf', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 0.68, 0, 'THESIS_BROKEN', '2026-06-11T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('35a44ce6-96a6-4cec-8440-cc70f0c7b4e1', 'BLDP', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 5, 'CALL', '2026-08-21', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('35a44ce6-96a6-4cec-8440-cc70f0c7b4e1', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 0.6, NULL, '2026-05-15T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('35a44ce6-96a6-4cec-8440-cc70f0c7b4e1', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 0.27, 0, 'THESIS_BROKEN', '2026-06-11T13:00:00-04:00');

-- CRNC
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('a5c94ad1-7d6b-4f8a-8098-f6c9fe508a77', 'CRNC', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('a5c94ad1-7d6b-4f8a-8098-f6c9fe508a77', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 9.98, 2.9, '2026-06-11T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('587b1d7d-238d-4d35-b316-1db771e9c3ec', 'CRNC', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 10, 'CALL', '2026-08-21', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('587b1d7d-238d-4d35-b316-1db771e9c3ec', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 1.85, NULL, '2026-05-22T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('587b1d7d-238d-4d35-b316-1db771e9c3ec', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 1.9, 0, 'PROFIT_TARGET', '2026-06-11T13:00:00-04:00');

-- CTS
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('682afccf-e13b-448f-88c8-ad85c573ba69', 'CTS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('682afccf-e13b-448f-88c8-ad85c573ba69', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 51.26, 1.98, '2026-05-01T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('d7d8cbde-2738-42c4-9485-87abff15c3ed', 'CTS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 50, 'CALL', '2026-10-16', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('d7d8cbde-2738-42c4-9485-87abff15c3ed', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 6.28, 0.22, '2026-05-15T13:00:00-04:00');

-- CXDO
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('f168b6d0-180f-4d77-bbf2-2e4734bf26b0', 'CXDO', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('f168b6d0-180f-4d77-bbf2-2e4734bf26b0', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 6.93, 2.8, '2026-06-11T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('a5ad537f-a98a-4fab-8ae2-f449174f38cb', 'CXDO', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 7.5, 'CALL', '2026-07-17', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('a5ad537f-a98a-4fab-8ae2-f449174f38cb', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 0.65, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('a5ad537f-a98a-4fab-8ae2-f449174f38cb', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 0.43, 0, 'THESIS_BROKEN', '2026-06-11T13:00:00-04:00');

-- ENS
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('0a3499e9-4264-41ca-8c74-6f1646aab3a8', 'ENS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('0a3499e9-4264-41ca-8c74-6f1646aab3a8', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 116.63, 8.5, '2026-05-01T13:00:00-04:00');

-- FIVN
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('d1660b1c-e9c9-4792-934b-b515711c3a88', 'FIVN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('d1660b1c-e9c9-4792-934b-b515711c3a88', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 20.48, 6.3, '2026-06-11T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('4b535984-90ef-42fa-bbe7-b02d7cc16ff8', 'FIVN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 22.5, 'CALL', '2026-10-16', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('4b535984-90ef-42fa-bbe7-b02d7cc16ff8', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 2.67, 0.7, '2026-05-13T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('47def489-2e6a-4e2e-983d-f9897e192080', 'FIVN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 25, 'CALL', '2026-10-16', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('47def489-2e6a-4e2e-983d-f9897e192080', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 3.7, NULL, '2026-05-28T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('47def489-2e6a-4e2e-983d-f9897e192080', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 1.9, 0, 'THESIS_BROKEN', '2026-06-11T13:00:00-04:00');

-- FPS
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('a2459366-0257-417f-a73a-9aac1b5aa9ce', 'FPS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('a2459366-0257-417f-a73a-9aac1b5aa9ce', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 34.31, 2.25, '2026-05-01T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('3b6fe509-0832-4312-ab28-0802909a93f9', 'FPS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 35, 'CALL', '2026-11-20', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('3b6fe509-0832-4312-ab28-0802909a93f9', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 8.64, 0.25, '2026-05-15T13:00:00-04:00');

-- GDYN
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('77ae0ec2-e75a-4cdb-9093-35dd672c586c', 'GDYN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('77ae0ec2-e75a-4cdb-9093-35dd672c586c', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 6.34, 2.9, '2026-06-11T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('52d3167e-4d57-462e-acd0-0c517c416d0f', 'GDYN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 5, 'CALL', '2026-06-18', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('52d3167e-4d57-462e-acd0-0c517c416d0f', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 1.1, NULL, '2026-05-08T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('52d3167e-4d57-462e-acd0-0c517c416d0f', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 1.45, 0, 'PROFIT_TARGET', '2026-06-11T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('7e64860c-def5-416e-84d5-877b026c733a', 'GDYN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 5, 'CALL', '2026-09-18', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('7e64860c-def5-416e-84d5-877b026c733a', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 1.51, NULL, '2026-05-08T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('7e64860c-def5-416e-84d5-877b026c733a', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 2.0, 0, 'PROFIT_TARGET', '2026-06-11T13:00:00-04:00');

-- HII
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('a0949410-1eb6-4e69-bba0-5c93c50ca126', 'HII', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('a0949410-1eb6-4e69-bba0-5c93c50ca126', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 292.94, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('a0949410-1eb6-4e69-bba0-5c93c50ca126', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 296.41, 0, 'PROFIT_TARGET', '2026-06-03T13:00:00-04:00');

-- HOOD
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('83250803-30de-4a47-9fc2-3d9364e30ecb', 'HOOD', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('83250803-30de-4a47-9fc2-3d9364e30ecb', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 19.74, 0.8, '2026-05-01T13:00:00-04:00');

-- IRDM
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('d576125e-e91f-4177-9858-2f36e3987903', 'IRDM', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 22.5, 'CALL', '2026-07-17', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('d576125e-e91f-4177-9858-2f36e3987903', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 3.35, 3.4, '2026-05-01T13:00:00-04:00');

-- KTOS
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('b2392c9e-5bd2-4ce0-9812-bff6cfcfe231', 'KTOS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('b2392c9e-5bd2-4ce0-9812-bff6cfcfe231', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 22.34, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('b2392c9e-5bd2-4ce0-9812-bff6cfcfe231', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 58.22, 0, 'PROFIT_TARGET', '2026-06-03T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('8ea3b59c-4a14-4130-acaa-f57bfe42acd1', 'KTOS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 35, 'CALL', '2027-01-15', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('8ea3b59c-4a14-4130-acaa-f57bfe42acd1', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 54.0, NULL, '2025-09-26T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('8ea3b59c-4a14-4130-acaa-f57bfe42acd1', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 21.15, 0, 'THESIS_BROKEN', '2026-05-15T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('91190176-ecd5-43d5-9f60-968c2b7ce5fa', 'KTOS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 40, 'CALL', '2027-01-15', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('91190176-ecd5-43d5-9f60-968c2b7ce5fa', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 49.5, NULL, '2025-09-26T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('91190176-ecd5-43d5-9f60-968c2b7ce5fa', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 16.9, 0, 'THESIS_BROKEN', '2026-05-15T13:00:00-04:00');

-- LEU
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('4435a32c-2f2d-4220-be31-d7a8652b10d9', 'LEU', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('4435a32c-2f2d-4220-be31-d7a8652b10d9', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 96.94, 1.5, '2026-05-01T13:00:00-04:00');

-- LUMN
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('80a32a5e-59a9-4b7e-829b-cdb680d72f22', 'LUMN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 7, 'CALL', '2027-01-15', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('80a32a5e-59a9-4b7e-829b-cdb680d72f22', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 2.86, NULL, '2026-05-08T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('80a32a5e-59a9-4b7e-829b-cdb680d72f22', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 2.48, 0, 'THESIS_BROKEN', '2026-06-11T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('0e187b0e-d630-45dd-ae91-9c8bb9f6c7c3', 'LUMN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 8, 'CALL', '2026-05-15', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('0e187b0e-d630-45dd-ae91-9c8bb9f6c7c3', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 0.93, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('0e187b0e-d630-45dd-ae91-9c8bb9f6c7c3', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 0.77, 0, 'THESIS_BROKEN', '2026-05-08T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('e04b6de8-a191-49e2-93e2-988f9c055070', 'LUMN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 8, 'CALL', '2026-07-17', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('e04b6de8-a191-49e2-93e2-988f9c055070', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 1.17, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('e04b6de8-a191-49e2-93e2-988f9c055070', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 5.55, 0, 'PROFIT_TARGET', '2026-05-08T13:00:00-04:00');

-- MITK
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('572907ad-1368-4db9-94e5-8fab0f60e90a', 'MITK', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('572907ad-1368-4db9-94e5-8fab0f60e90a', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 13.28, 3.69, '2026-02-27T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('a68306d4-c863-4d90-ba4a-c6c8f04cae31', 'MITK', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 12.5, 'CALL', '2026-11-20', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('a68306d4-c863-4d90-ba4a-c6c8f04cae31', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 3.77, 0.41, '2026-04-08T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('9ba5f3bc-4a0f-4654-a1cd-36bcedcb9599', 'MITK', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 12.5, 'CALL', '2026-07-17', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('9ba5f3bc-4a0f-4654-a1cd-36bcedcb9599', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 1.77, NULL, '2026-02-27T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('9ba5f3bc-4a0f-4654-a1cd-36bcedcb9599', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 4.13, 0, 'PROFIT_TARGET', '2026-06-11T13:00:00-04:00');

-- NBIS
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('6a880e06-d216-4496-9879-d504f721cb25', 'NBIS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('6a880e06-d216-4496-9879-d504f721cb25', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 23.92, 4.3, '2026-05-01T13:00:00-04:00');

-- OSS
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('60952c93-f0c2-4d37-bdba-fba7bca4cafc', 'OSS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('60952c93-f0c2-4d37-bdba-fba7bca4cafc', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 4.71, 10.8, '2026-05-01T13:00:00-04:00');

-- P
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('8553cfbc-a0f5-43cf-b458-79bbed533e42', 'P', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 75, 'CALL', '2026-08-21', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('8553cfbc-a0f5-43cf-b458-79bbed533e42', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 8.8, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('8553cfbc-a0f5-43cf-b458-79bbed533e42', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 4.4, 0, 'THESIS_BROKEN', '2026-05-28T13:00:00-04:00');

-- PLPC
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('81c3082b-7a91-4239-bdf8-f70006a35074', 'PLPC', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('81c3082b-7a91-4239-bdf8-f70006a35074', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 192.16, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('81c3082b-7a91-4239-bdf8-f70006a35074', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 390.17, 0, 'PROFIT_TARGET', '2026-06-03T13:00:00-04:00');

-- RDCM
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('9df86161-f971-4d06-aeff-f1a2c1ed2be7', 'RDCM', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('9df86161-f971-4d06-aeff-f1a2c1ed2be7', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 12.91, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('9df86161-f971-4d06-aeff-f1a2c1ed2be7', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 12.32, 0, 'THESIS_BROKEN', '2026-06-05T13:00:00-04:00');

-- RNG
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('f7fdec08-e4a4-48a9-8b36-2aaa7fcad69b', 'RNG', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 50, 'CALL', '2026-06-18', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('f7fdec08-e4a4-48a9-8b36-2aaa7fcad69b', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 3.63, NULL, '2026-05-08T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('f7fdec08-e4a4-48a9-8b36-2aaa7fcad69b', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'EXPIRED', 0, 0, 'EXPIRED_WORTHLESS', '2026-06-18T16:00:00-04:00');

-- SHLS
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('eb87b0b9-2e7f-47a2-870d-969e5de96073', 'SHLS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('eb87b0b9-2e7f-47a2-870d-969e5de96073', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 9.41, 2.8, '2026-06-11T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('2c6ac99a-e510-4cbd-8d0c-685d358f625c', 'SHLS', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 10, 'CALL', '2026-10-16', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('2c6ac99a-e510-4cbd-8d0c-685d358f625c', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 1.95, NULL, '2026-05-15T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('2c6ac99a-e510-4cbd-8d0c-685d358f625c', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 1.58, 0, 'THESIS_BROKEN', '2026-06-11T13:00:00-04:00');

-- SYNA
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('13fe0108-7ab6-48af-8652-8ca98fe933b2', 'SYNA', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('13fe0108-7ab6-48af-8652-8ca98fe933b2', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 86.14, 4.23, '2026-05-01T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('76fa491c-f100-428f-a778-87d1dfc5f8b6', 'SYNA', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 85, 'CALL', '2026-09-18', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('76fa491c-f100-428f-a778-87d1dfc5f8b6', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 9.9, 0.47, '2026-05-15T13:00:00-04:00');

-- TE
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('44a5dfd5-fc32-4c3e-90f6-72baefe79588', 'TE', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('44a5dfd5-fc32-4c3e-90f6-72baefe79588', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 7.87, 6.4, '2026-06-12T13:00:00-04:00');

-- TSLA
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('521f103e-a760-482f-8634-5f1f513c7ce3', 'TSLA', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('521f103e-a760-482f-8634-5f1f513c7ce3', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 19.38, 0.8, '2026-05-01T13:00:00-04:00');

-- VIAV
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('4b736365-9e5c-4dfa-bd12-ed5f63bb292d', 'VIAV', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('4b736365-9e5c-4dfa-bd12-ed5f63bb292d', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 14.63, 14.3, '2026-05-01T13:00:00-04:00');

-- VLN
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('552c3be1-18a7-42e3-9700-170fe2279bc7', 'VLN', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('552c3be1-18a7-42e3-9700-170fe2279bc7', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 1.57, NULL, '2026-05-01T13:00:00-04:00');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at) values ('552c3be1-18a7-42e3-9700-170fe2279bc7', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SELL', 2.1, 0, 'PROFIT_TARGET', '2026-06-05T13:00:00-04:00');

-- VPG
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('c47f4b3b-7df8-4039-8719-56b7c1b28b78', 'VPG', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'SHARES', NULL, NULL, NULL, 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('c47f4b3b-7df8-4039-8719-56b7c1b28b78', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 53.16, 5.85, '2026-05-01T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('1f754d37-2d45-4354-8d28-b51b4b93af97', 'VPG', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 50, 'CALL', '2026-11-20', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('1f754d37-2d45-4354-8d28-b51b4b93af97', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 9.2, 0.325, '2026-05-15T13:00:00-04:00');
insert into public.legs (id, ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction)
  values ('61827409-1a65-4f8a-97d4-fdcf357742d5', 'VPG', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'OPTION', 60, 'CALL', '2026-06-19', 'long');
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at) values ('61827409-1a65-4f8a-97d4-fdcf357742d5', '64a779f9-13ba-4cb4-824b-d70dcab3a49b', 'BUY', 5.3, 0.325, '2026-05-15T13:00:00-04:00');

-- 3) Fix corrupted holding statuses (backup-correct values)
update public.holdings set last_action = 'Closed', action_date = '2026-06-05' where ticker = 'AMRC' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-05' where ticker = 'AMSC' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-11' where ticker = 'ARRY' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-05-15' where ticker = 'AVAV' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-10' where ticker = 'BB' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-11' where ticker = 'BLDP' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-03' where ticker = 'HII' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-03' where ticker = 'KTOS' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-11' where ticker = 'LUMN' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-05-28' where ticker = 'P' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-03' where ticker = 'PLPC' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-05' where ticker = 'RDCM' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-18' where ticker = 'RNG' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Hold' where ticker = 'SYNA' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';
update public.holdings set last_action = 'Closed', action_date = '2026-06-05' where ticker = 'VLN' and trader_id = '64a779f9-13ba-4cb4-824b-d70dcab3a49b';

commit;

-- VERIFY (run after commit):
--   select ticker, instrument_type, option_strike, option_right, status, entry_price, weight, exit_price, realized_pnl_pct
--   from public.legs where trader_id='64a779f9-13ba-4cb4-824b-d70dcab3a49b' order by ticker, status, instrument_type;