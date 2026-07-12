-- 20260703180000_seed_submittal_approved_to_scrub_flag.sql
--
-- Seed the `submittal_approved_to_scrub` feature flag.
--
-- Phase 1 of the submittal-logic routing correction. When ON, a BFA
-- "Approved" disposition routes through the detailer scrub (OFS -> IFC ->
-- Released) exactly like "Approved as Noted", instead of skipping straight to
-- IFC. Default behavior remains unchanged.
-- 
-- Per-user enrollment is administrator-managed operational state.
-- Existing administrator-set global values and overrides are preserved.
--
-- Additive + idempotent: re-running only refreshes the description while
-- preserving any admin-set global `enabled` value and the owner override.
-- No new table/policy — `feature_flags` already exists with RLS enabled
-- (SELECT to authenticated; INSERT/UPDATE/DELETE gated to system admins).

INSERT INTO public.feature_flags (flag_key, enabled, user_overrides, description)
VALUES (
  'submittal_approved_to_scrub',
  false,
  '{}'::jsonb,
  'When on, a BFA "Approved" submittal routes through the detailer scrub (OFS -> IFC -> Released) like "Approved as Noted", rather than skipping to IFC. Phase 1 submittal-logic routing correction.'
)
ON CONFLICT (flag_key) DO UPDATE
SET description = EXCLUDED.description;
