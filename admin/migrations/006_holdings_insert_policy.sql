-- Fix: Allow authenticated admin to insert/upsert holdings rows
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- Root cause: The admin's saveEdit() uses .upsert() (POST ?on_conflict=ticker),
-- which PostgreSQL treats as INSERT ... ON CONFLICT DO UPDATE.
-- RLS checks the INSERT policy first; without one, the whole upsert fails 403
-- even when the row already exists and only UPDATE is needed.
-- Migration 005 added the UPDATE policy; this adds the matching INSERT policy.

CREATE POLICY "admin_can_insert_holdings" ON public.holdings
  FOR INSERT TO authenticated
  WITH CHECK (auth.email() = 'cc@claudiachez.com');
