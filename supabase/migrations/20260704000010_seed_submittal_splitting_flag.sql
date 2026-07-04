-- 20260704000010_seed_submittal_splitting_flag.sql
--
-- Seed the `submittal_splitting` feature flag.
--
-- Phase 3 of the submittal-logic integration. When ON, the submittal register
-- + detail panel expose package SPLITTING: a "Spin off child" action on an
-- approved/terminal submittal, a lineage card ("Spun off from <parent>" +
-- child list), and parent-grouped register rows. Default OFF so global behavior
-- is unchanged; the owner (nickl@shsteelaz.com) is opted in via `user_overrides`
-- for field testing.
--
-- Additive + idempotent: re-running only refreshes the description while
-- preserving any admin-set global `enabled` value and the owner override.
-- No new table/policy — `feature_flags` already exists with RLS enabled
-- (SELECT to authenticated; INSERT/UPDATE/DELETE gated to system admins).
--
-- Matches the Phase 1 (submittal_approved_to_scrub) / Phase 2
-- (submittal_revision_autobump) seed pattern exactly.

INSERT INTO public.feature_flags (flag_key, enabled, user_overrides, description)
VALUES (
  'submittal_splitting',
  false,
  '{"nickl@shsteelaz.com": true}'::jsonb,
  'When on, an approved submittal can be split into child submittals that link back to the parent (parent_submittal_id + split_reason), with lineage shown in the detail panel and children grouped under the parent in the register. Phase 3 submittal-logic integration.'
)
ON CONFLICT (flag_key) DO UPDATE
SET description = EXCLUDED.description;
