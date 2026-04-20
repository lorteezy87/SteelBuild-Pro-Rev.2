-- SteelBuild Pro — Change Orders: add missing schedule_impact_days column
-- Migration 005
--
-- The change_orders table was created without the schedule_impact_days column
-- that the COFormModal form sends on create/update. This caused:
--   [change_orders.create] Could not find the 'schedule_impact_days' column
--
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS schedule_impact_days INTEGER DEFAULT 0;
