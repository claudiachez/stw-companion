-- Migration 047: add macro_prefs JSONB column to profiles
-- Stores { "visibleIndicators": ["SPY","QQQ","VIX","US10Y"] }
-- Default empty object = show defaults only.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS macro_prefs JSONB DEFAULT '{}';
