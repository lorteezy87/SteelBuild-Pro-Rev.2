-- ============================================================================
-- 20260610020000_rls_role_floors_drawings.sql — finish the viewer-write fix
-- on drawings/drawing_sets (deferred from 20260610010000)
-- ============================================================================
-- Applied live to project kjrwqagyeswwoxpjkcko via Supabase MCP on 2026-06-10
-- and verified, then captured here so repo and live stay in sync.
--
-- Companion to 20260610010000_rls_role_floors_on_writes, which deliberately
-- deferred these two tables because drawings' UPDATE policy carries the
-- released-set lock check. This migration adds the role floors while
-- preserving that lock logic VERBATIM (captured from live pg_policies).
--
-- Floors (viewer = 0, field = 1, pm = 2, admin/owner = 3):
--   drawings      SELECT member | INSERT/UPDATE >= field | DELETE >= pm
--   drawing_sets  SELECT member | INSERT/UPDATE >= field | DELETE >= admin (unchanged)
--
-- Why field (not pm) for UPDATE: field-usable surfaces legitimately write
-- drawings (DrawingViewer markup_scale calibration, stage changes,
-- assignment). Why pm for drawings hard-DELETE: the app only ever
-- soft-deletes (entity .delete() is an UPDATE for SOFT_DELETE_TABLES), so
-- SQL DELETE is raw-API-only and can be strict with zero app impact.
-- Soft-deleting a drawing in a locked set stays blocked for non-admins via
-- the UPDATE lock check — intended.

-- ── drawings ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS drawings_insert ON public.drawings;
CREATE POLICY drawings_insert ON public.drawings
  FOR INSERT TO authenticated
  WITH CHECK (user_has_project_role_at_least(project_id, 'field'));

DROP POLICY IF EXISTS drawings_update ON public.drawings;
CREATE POLICY drawings_update ON public.drawings
  FOR UPDATE TO authenticated
  USING (user_has_project_role_at_least(project_id, 'field'))
  WITH CHECK (
    user_has_project_role_at_least(project_id, 'field')
    AND (
      (NOT COALESCE((SELECT ds.is_locked
                       FROM drawing_sets ds
                      WHERE ds.id = drawings.drawing_set_id), false))
      OR user_has_project_role_at_least(project_id, 'admin')
    )
  );

DROP POLICY IF EXISTS drawings_delete ON public.drawings;
CREATE POLICY drawings_delete ON public.drawings
  FOR DELETE TO authenticated
  USING (user_has_project_role_at_least(project_id, 'pm'));

-- ── drawing_sets (delete stays admin-only — not touched) ───────────────────
DROP POLICY IF EXISTS drawing_sets_insert ON public.drawing_sets;
CREATE POLICY drawing_sets_insert ON public.drawing_sets
  FOR INSERT TO authenticated
  WITH CHECK (user_has_project_role_at_least(project_id, 'field'));

DROP POLICY IF EXISTS drawing_sets_update ON public.drawing_sets;
CREATE POLICY drawing_sets_update ON public.drawing_sets
  FOR UPDATE TO authenticated
  USING (user_has_project_role_at_least(project_id, 'field'))
  WITH CHECK (user_has_project_role_at_least(project_id, 'field'));

NOTIFY pgrst, 'reload schema';
