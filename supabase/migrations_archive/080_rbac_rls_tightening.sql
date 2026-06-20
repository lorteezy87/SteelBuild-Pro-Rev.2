-- 080_rbac_rls_tightening.sql
-- RBAC Phase B: Tighten RLS for drawing_sets/drawings/signoffs/zones/links/zone_dependencies.
-- Drops redundant project_member_access ALL policies on drawing_sets/drawings so the
-- per-cmd policies are the active gate, then restricts DELETE on drawing_sets to admins,
-- adds an unlock-trigger requiring admin role, carves out signoff voiding to admin/signer,
-- and adds a set-lock check on writes to zones/links/dependencies/markup.

-- ─── Drop redundant project_member_access policies ──────────────────────
DROP POLICY IF EXISTS project_member_access ON public.drawing_sets;
DROP POLICY IF EXISTS project_member_access ON public.drawings;

-- ─── drawing_sets DELETE: admin only ────────────────────────────────────
DROP POLICY IF EXISTS project_delete ON public.drawing_sets;
CREATE POLICY drawing_sets_delete_admin
  ON public.drawing_sets FOR DELETE
  USING (public.user_has_project_role_at_least(project_id, 'admin'));

-- ─── drawing_sets UNLOCK: admin only (enforced via trigger) ─────────────
-- The RLS UPDATE policy stays at project_access; the trigger enforces
-- the admin-only constraint specifically on the locked->unlocked transition.

CREATE OR REPLACE FUNCTION public.enforce_drawing_set_unlock_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (OLD.is_locked = true AND NEW.is_locked = false) THEN
    IF NOT public.user_has_project_role_at_least(NEW.project_id, 'admin') THEN
      RAISE EXCEPTION 'Only admins can unlock drawing sets'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drawing_sets_unlock_role_check ON public.drawing_sets;
CREATE TRIGGER drawing_sets_unlock_role_check
  BEFORE UPDATE OF is_locked ON public.drawing_sets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_drawing_set_unlock_role();

-- ─── drawing_signoffs: void carve-out (admin or original signer) ────────
-- Note: signer column is `stamped_by_id` in this schema (not `signed_by_id`).
DROP POLICY IF EXISTS drawing_signoffs_project_access ON public.drawing_signoffs;

CREATE POLICY drawing_signoffs_select
  ON public.drawing_signoffs FOR SELECT
  USING (public.user_has_project_access(project_id));

CREATE POLICY drawing_signoffs_insert
  ON public.drawing_signoffs FOR INSERT
  WITH CHECK (public.user_has_project_access(project_id));

CREATE POLICY drawing_signoffs_update
  ON public.drawing_signoffs FOR UPDATE
  USING (public.user_has_project_access(project_id))
  WITH CHECK (
    public.user_has_project_access(project_id)
    AND (
      is_voided = false
      OR public.user_has_project_role_at_least(project_id, 'admin')
      OR stamped_by_id = auth.uid()
    )
  );

CREATE POLICY drawing_signoffs_delete
  ON public.drawing_signoffs FOR DELETE
  USING (public.user_has_project_role_at_least(project_id, 'admin'));

-- ─── Set-lock helper for write tables that reference drawings ───────────
CREATE OR REPLACE FUNCTION public.set_for_drawing_is_locked(p_drawing_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(ds.is_locked, false)
    FROM public.drawings d
    JOIN public.drawing_sets ds ON ds.id = d.drawing_set_id
   WHERE d.id = p_drawing_id;
$$;

GRANT EXECUTE ON FUNCTION public.set_for_drawing_is_locked(uuid) TO authenticated;

-- Helper for zone-keyed tables (drawing_zone_dependencies has zone ids, not drawing_id)
CREATE OR REPLACE FUNCTION public.set_for_zone_is_locked(p_zone_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(ds.is_locked, false)
    FROM public.drawing_zones z
    JOIN public.drawings d ON d.id = z.drawing_id
    JOIN public.drawing_sets ds ON ds.id = d.drawing_set_id
   WHERE z.id = p_zone_id;
$$;

GRANT EXECUTE ON FUNCTION public.set_for_zone_is_locked(uuid) TO authenticated;

-- ─── drawing_zones: lock-aware writes ───────────────────────────────────
DROP POLICY IF EXISTS drawing_zones_project_access ON public.drawing_zones;

CREATE POLICY drawing_zones_select
  ON public.drawing_zones FOR SELECT
  USING (public.user_has_project_access(project_id));

CREATE POLICY drawing_zones_insert
  ON public.drawing_zones FOR INSERT
  WITH CHECK (
    public.user_has_project_access(project_id)
    AND (
      NOT public.set_for_drawing_is_locked(drawing_id)
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
  );

CREATE POLICY drawing_zones_update
  ON public.drawing_zones FOR UPDATE
  USING (public.user_has_project_access(project_id))
  WITH CHECK (
    public.user_has_project_access(project_id)
    AND (
      NOT public.set_for_drawing_is_locked(drawing_id)
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
  );

CREATE POLICY drawing_zones_delete
  ON public.drawing_zones FOR DELETE
  USING (
    public.user_has_project_access(project_id)
    AND (
      NOT public.set_for_drawing_is_locked(drawing_id)
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
  );

-- ─── drawing_links: lock-aware writes ───────────────────────────────────
DROP POLICY IF EXISTS drawing_links_project_access ON public.drawing_links;

CREATE POLICY drawing_links_select
  ON public.drawing_links FOR SELECT
  USING (public.user_has_project_access(project_id));

CREATE POLICY drawing_links_insert
  ON public.drawing_links FOR INSERT
  WITH CHECK (
    public.user_has_project_access(project_id)
    AND (
      NOT public.set_for_drawing_is_locked(drawing_id)
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
  );

CREATE POLICY drawing_links_update
  ON public.drawing_links FOR UPDATE
  USING (public.user_has_project_access(project_id))
  WITH CHECK (
    public.user_has_project_access(project_id)
    AND (
      NOT public.set_for_drawing_is_locked(drawing_id)
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
  );

CREATE POLICY drawing_links_delete
  ON public.drawing_links FOR DELETE
  USING (
    public.user_has_project_access(project_id)
    AND (
      NOT public.set_for_drawing_is_locked(drawing_id)
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
  );

-- ─── drawing_zone_dependencies: lock-aware writes (keyed off source zone) ─
DROP POLICY IF EXISTS drawing_zone_dependencies_project_access ON public.drawing_zone_dependencies;

CREATE POLICY drawing_zone_dependencies_select
  ON public.drawing_zone_dependencies FOR SELECT
  USING (public.user_has_project_access(project_id));

CREATE POLICY drawing_zone_dependencies_insert
  ON public.drawing_zone_dependencies FOR INSERT
  WITH CHECK (
    public.user_has_project_access(project_id)
    AND (
      NOT public.set_for_zone_is_locked(source_zone_id)
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
  );

CREATE POLICY drawing_zone_dependencies_update
  ON public.drawing_zone_dependencies FOR UPDATE
  USING (public.user_has_project_access(project_id))
  WITH CHECK (
    public.user_has_project_access(project_id)
    AND (
      NOT public.set_for_zone_is_locked(source_zone_id)
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
  );

CREATE POLICY drawing_zone_dependencies_delete
  ON public.drawing_zone_dependencies FOR DELETE
  USING (
    public.user_has_project_access(project_id)
    AND (
      NOT public.set_for_zone_is_locked(source_zone_id)
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
  );

-- ─── drawings UPDATE: lock-aware (markup writes go through this policy) ─
-- Replace the existing project-access-only update policy so that writes
-- to a row whose set is locked require admin role. The drawings table itself
-- carries `markup` jsonb; gating UPDATE here covers markup writes.
DROP POLICY IF EXISTS project_update ON public.drawings;
CREATE POLICY drawings_update
  ON public.drawings FOR UPDATE
  USING (public.user_has_project_access(project_id))
  WITH CHECK (
    public.user_has_project_access(project_id)
    AND (
      NOT COALESCE((SELECT ds.is_locked FROM public.drawing_sets ds WHERE ds.id = drawings.drawing_set_id), false)
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
  );
