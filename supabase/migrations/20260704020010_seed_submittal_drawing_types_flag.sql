-- 20260704020010_seed_submittal_drawing_types_flag.sql
--
-- Seed the `submittal_drawing_types` feature flag.
--
-- Phase 4 of the submittal-logic integration. When ON, the submittal detail
-- panel exposes per-drawing-type (Shop / Erection / Part) received + released
-- tracking (backed by the submittal_components table), plus S/E/P chips on the
-- register rows + detail header. Default OFF so global behavior is unchanged;
-- the owner (nickl@shsteelaz.com) is opted in via `user_overrides` for field
-- testing.
--
-- Additive + idempotent: re-running only refreshes the description while
-- preserving any admin-set global `enabled` value and the owner override.
-- No new table/policy — `feature_flags` already exists with RLS enabled
-- (SELECT to authenticated; INSERT/UPDATE/DELETE gated to system admins).
--
-- Matches the Phase 1 (submittal_approved_to_scrub) / Phase 2
-- (submittal_revision_autobump) / Phase 3 (submittal_splitting) seed pattern
-- exactly.

INSERT INTO public.feature_flags (flag_key, enabled, user_overrides, description)
VALUES (
  'submittal_drawing_types',
  false,
  '{"nickl@shsteelaz.com": true}'::jsonb,
  'When on, a submittal tracks each drawing type (Shop/Erection/Part) independently — its own received + released-for-fabrication dates — via the submittal_components table, with per-type controls in the detail panel and S/E/P chips in the register. Release-per-type is independent of submittals.status and the fab-release gate. Phase 4 submittal-logic integration.'
)
ON CONFLICT (flag_key) DO UPDATE
SET description = EXCLUDED.description;
