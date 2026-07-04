-- 20260704000000_seed_submittal_revision_autobump_flag.sql
--
-- Seed the `submittal_revision_autobump` feature flag.
--
-- Phase 2 of the submittal-logic integration. When ON, opening a NEW round
-- because the prior disposition was "Revise and Resubmit" or "Rejected"
-- auto-advances the submittal's text `revision` column to its next value
-- ('0' -> '1', 'A' -> 'B', 'Rev 2' -> 'Rev 3'). Default OFF so global behavior
-- is unchanged (revision stays a manual field); the owner (nickl@shsteelaz.com)
-- is opted in via `user_overrides` for field testing.
--
-- Additive + idempotent: re-running only refreshes the description while
-- preserving any admin-set global `enabled` value and the owner override.
-- No new table/policy -- `feature_flags` already exists with RLS enabled
-- (SELECT to authenticated; INSERT/UPDATE/DELETE gated to system admins).

INSERT INTO public.feature_flags (flag_key, enabled, user_overrides, description)
VALUES (
  'submittal_revision_autobump',
  false,
  '{"nickl@shsteelaz.com": true}'::jsonb,
  'When on, a Revise & Resubmit / Rejected verdict that opens a new round auto-bumps the submittal text revision to its next value (0->1, A->B, Rev 2->Rev 3). Default off; revision stays manual otherwise. Phase 2 submittal-logic integration.'
)
ON CONFLICT (flag_key) DO UPDATE
SET description = EXCLUDED.description;
