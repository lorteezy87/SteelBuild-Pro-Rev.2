-- 20260712000000_seed_feature_flag_catalog.sql
-- 
-- Seed production feature flag catalog entries and preserve existing rollout state.
--
-- This migration is the canonical catalog source for production flags and is safe
-- to re-run because it never mutates `enabled` or `user_overrides` on conflict.
-- Existing environment rollout decisions (global values + per-user overrides) stay
-- intact.

INSERT INTO public.feature_flags (flag_key, enabled, user_overrides, description)
VALUES
  ('account_deletion', false, '{}'::jsonb, 'Controls visibility and access to the account deletion flow.'),
  ('command_ui', true, '{}'::jsonb, 'Controls optional command-ui surfaces and workflows.'),
  ('revision_ai_diff', false, '{}'::jsonb, 'Controls whether AI revision comparison assistance is shown for revision workflows.'),
  ('submittal_approved_to_scrub', false, '{}'::jsonb, 'Controls whether approved submittals proceed through the detailer scrub path.'),
  ('submittal_drawing_types', false, '{}'::jsonb, 'Controls submittal drawing-type-level received/released behavior and UI exposure.'),
  ('submittal_revision_autobump', false, '{}'::jsonb, 'Controls auto-advancing text revision values when opening a new submittal round.'),
  ('submittal_splitting', false, '{}'::jsonb, 'Controls submittal split/child lineage workflows in the register and detail views.'),
  ('submittal_workday_dues', false, '{}'::jsonb, 'Controls working-day based due-date behavior for eligible submittal movements.'),
  ('viewer_3d', false, '{}'::jsonb, 'Controls availability of the 3D model viewing workflow.')
ON CONFLICT (flag_key) DO UPDATE
SET description = EXCLUDED.description;

