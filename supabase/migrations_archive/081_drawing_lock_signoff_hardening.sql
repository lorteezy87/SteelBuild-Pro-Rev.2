-- 081_drawing_lock_signoff_hardening.sql
-- Harden server-side authorization for drawing-set lock transitions and
-- formal signoff audit rows.

-- Require admin role for any lock state transition (lock or unlock).
CREATE OR REPLACE FUNCTION public.enforce_drawing_set_lock_transition_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_locked IS DISTINCT FROM OLD.is_locked THEN
    IF NOT public.user_has_project_role_at_least(NEW.project_id, 'admin') THEN
      RAISE EXCEPTION 'Only admins can change drawing-set lock state'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drawing_sets_unlock_role_check ON public.drawing_sets;
DROP TRIGGER IF EXISTS drawing_sets_lock_transition_role_check ON public.drawing_sets;
CREATE TRIGGER drawing_sets_lock_transition_role_check
  BEFORE UPDATE OF is_locked ON public.drawing_sets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_drawing_set_lock_transition_role();

-- Signoff stamps are formal approvals: only PM/Admin can create, and only
-- admin or original signer can void; non-void updates are blocked.
DROP POLICY IF EXISTS drawing_signoffs_insert ON public.drawing_signoffs;
CREATE POLICY drawing_signoffs_insert
  ON public.drawing_signoffs FOR INSERT
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

DROP POLICY IF EXISTS drawing_signoffs_update ON public.drawing_signoffs;
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

CREATE OR REPLACE FUNCTION public.enforce_signoff_void_only_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_voided IS DISTINCT FROM OLD.is_voided THEN
    IF NEW.is_voided = false THEN
      RAISE EXCEPTION 'Signoff void state cannot be reverted'
        USING ERRCODE = '42501';
    END IF;

    IF NOT (
      public.user_has_project_role_at_least(OLD.project_id, 'admin')
      OR OLD.stamped_by_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Only admins or original signer can void signoffs'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.project_id          IS DISTINCT FROM OLD.project_id
     OR NEW.drawing_revision_id IS DISTINCT FROM OLD.drawing_revision_id
     OR NEW.drawing_id       IS DISTINCT FROM OLD.drawing_id
     OR NEW.stamp_type       IS DISTINCT FROM OLD.stamp_type
     OR NEW.pdf_page         IS DISTINCT FROM OLD.pdf_page
     OR NEW.x                IS DISTINCT FROM OLD.x
     OR NEW.y                IS DISTINCT FROM OLD.y
     OR NEW.width            IS DISTINCT FROM OLD.width
     OR NEW.height           IS DISTINCT FROM OLD.height
     OR NEW.rotation_deg     IS DISTINCT FROM OLD.rotation_deg
     OR NEW.stamped_by_id    IS DISTINCT FROM OLD.stamped_by_id
     OR NEW.stamped_by_name  IS DISTINCT FROM OLD.stamped_by_name
     OR NEW.stamped_at       IS DISTINCT FROM OLD.stamped_at
     OR NEW.notes            IS DISTINCT FROM OLD.notes
     OR NEW.signature_url    IS DISTINCT FROM OLD.signature_url
     OR NEW.metadata         IS DISTINCT FROM OLD.metadata
     OR NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'drawing_signoffs rows are append-only; only void fields may change'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drawing_signoffs_void_only_update_check ON public.drawing_signoffs;
CREATE TRIGGER drawing_signoffs_void_only_update_check
  BEFORE UPDATE ON public.drawing_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signoff_void_only_update();
