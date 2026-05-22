-- 071_drawing_sets_lock.sql — Set-level lock for drawing_sets
--
-- Adds is_locked / locked_at / locked_by / locked_reason to drawing_sets so
-- approval (and any future workflow step) can freeze further edits to the
-- zones, links, dependencies, and markup hanging off of any sheet in the
-- set. Service-layer guards (assertSetUnlocked) consult is_locked before
-- every write.
--
-- The lock is set-level (not sheet-level) intentionally: a coordination
-- approval applies to the set as a whole, and zones / links can span
-- sheets, so the natural boundary is the set.

ALTER TABLE public.drawing_sets
  ADD COLUMN IF NOT EXISTS is_locked     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at     timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS locked_reason text;


-- ============================================================================
-- Consolidated from 071_restrict_released_for_fabrication.sql
-- This migration shared a numeric version prefix with 071_drawing_sets_lock.sql, so Supabase's
-- migration runner (which keys on the leading numeric token) silently skipped
-- it on a clean apply, leaving its objects uncreated on fresh branch DBs.
-- Folded here so a from-scratch apply runs it in order. Production already
-- recorded it under a separate timestamp version, so prod is unaffected.
-- ============================================================================
-- Restrict high-impact fabrication release status transitions to elevated roles.
-- Keeps existing member access for other updates while blocking low-privilege users
-- from setting status='Released for Fabrication'.

CREATE POLICY submittals_released_for_fab_requires_elevated_role
ON public.submittals
AS RESTRICTIVE
FOR UPDATE
TO authenticated
WITH CHECK (
  status <> 'Released for Fabrication'
  OR public.get_my_project_role(project_id) = ANY (ARRAY['owner','admin','project_manager','reviewer'])
);

CREATE POLICY submittal_rounds_released_for_fab_requires_elevated_role
ON public.submittal_rounds
AS RESTRICTIVE
FOR UPDATE
TO authenticated
WITH CHECK (
  status <> 'Released for Fabrication'
  OR public.get_my_project_role(project_id) = ANY (ARRAY['owner','admin','project_manager','reviewer'])
);
