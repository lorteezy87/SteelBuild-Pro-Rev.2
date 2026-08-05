-- 20260704030000_seed_submittal_workday_dues_flag.sql
--
-- Seed the `submittal_workday_dues` feature flag.
--
-- Phase 5 (final) of the submittal-logic integration. When ON, a submittal that
-- moves OUT to someone with a clock — into OFA (Out For Approval; ball → EOR/GC)
-- or OFS (Out For Scrub; ball → detailer) — auto-stamps its due date
-- (submittals.required_date, only when unset) at today + the project's turnaround
-- lead counted in WORKING days (Mon–Fri, weekends never inflate the deadline);
-- OFA uses the `approval` lead, OFS the `scrub` lead from
-- projects.metadata.detailing_lead_days (per-package override honored),
-- defaulting to ~10 working days when absent. The hub's due countdown is then
-- shown in working days too. Default behavior remains unchanged.
-- 
-- Per-user enrollment is administrator-managed operational state.
-- Existing administrator-set global values and overrides are preserved.
--
-- Additive + idempotent: re-running only refreshes the description while
-- preserving any admin-set global `enabled` value and the owner override.
-- No new table/policy/column — `feature_flags` already exists with RLS enabled
-- (SELECT to authenticated; INSERT/UPDATE/DELETE gated to system admins), and
-- the due date reuses the existing submittals.required_date column.
--
-- Matches the Phase 1 (submittal_approved_to_scrub) / Phase 2
-- (submittal_revision_autobump) / Phase 3 (submittal_splitting) / Phase 4
-- (submittal_drawing_types) seed pattern exactly.

INSERT INTO public.feature_flags (flag_key, enabled, user_overrides, description)
VALUES (
  'submittal_workday_dues',
  false,
  '{}'::jsonb,
  'When on, a submittal moving into OFA (Out For Approval) or OFS (Out For Scrub) auto-stamps its due date (submittals.required_date, only when unset) at today + the project turnaround lead counted in WORKING days (Mon-Fri); OFA uses the approval lead, OFS the scrub lead from projects.metadata.detailing_lead_days (per-package override honored, ~10 working-day default), and the due countdown is shown in working days. Default off: required_date stays manual, calendar-day display, learned forecast unchanged. Phase 5 submittal-logic integration.'
)
ON CONFLICT (flag_key) DO UPDATE
SET description = EXCLUDED.description;
