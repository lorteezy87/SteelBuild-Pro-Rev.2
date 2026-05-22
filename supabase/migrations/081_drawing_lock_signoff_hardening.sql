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


-- ============================================================================
-- Consolidated from 081_llm_telemetry.sql
-- This migration shared a numeric version prefix with 081_drawing_lock_signoff_hardening.sql, so Supabase's
-- migration runner (which keys on the leading numeric token) silently skipped
-- it on a clean apply, leaving its objects uncreated on fresh branch DBs.
-- Folded here so a from-scratch apply runs it in order. Production already
-- recorded it under a separate timestamp version, so prod is unaffected.
-- ============================================================================
-- 081_llm_telemetry.sql
--
-- LLM Gateway Phase 1 telemetry table.
--
-- Captures one row per llm-proxy call so we can answer:
--   * Cost per use case / project / day
--   * P50/P95 latency by provider+model
--   * Error rate (success=false) and dominant error_kind by use case
--
-- Phase 2 will read this table to make informed per-use-case provider
-- routing decisions (e.g. switch sheet-extraction to Gemini Flash if
-- input-token volume is high).
--
-- Inserts are performed by the edge function under the service role,
-- which bypasses RLS — so we only need a SELECT policy. Admins can read
-- aggregates; everyone else gets nothing.

CREATE TABLE IF NOT EXISTS public.llm_telemetry (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  use_case        text NOT NULL DEFAULT 'general',
  provider        text NOT NULL,
  model           text NOT NULL,
  user_id         uuid,
  project_id      uuid,
  input_tokens    integer,
  output_tokens   integer,
  cost_usd        numeric(12, 6),
  latency_ms      integer,
  success         boolean NOT NULL DEFAULT true,
  error_kind      text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_llm_telemetry_use_case
  ON public.llm_telemetry(use_case, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_telemetry_provider
  ON public.llm_telemetry(provider, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_telemetry_project
  ON public.llm_telemetry(project_id, occurred_at DESC)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.llm_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS llm_telemetry_select ON public.llm_telemetry;
CREATE POLICY llm_telemetry_select ON public.llm_telemetry
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
    )
  );


-- ============================================================================
-- Consolidated from 081_photos_rbac_policies.sql
-- This migration shared a numeric version prefix with 081_drawing_lock_signoff_hardening.sql, so Supabase's
-- migration runner (which keys on the leading numeric token) silently skipped
-- it on a clean apply, leaving its objects uncreated on fresh branch DBs.
-- Folded here so a from-scratch apply runs it in order. Production already
-- recorded it under a separate timestamp version, so prod is unaffected.
-- ============================================================================
-- 081_photos_rbac_policies.sql
-- Enforce app RBAC model for photos at the database layer.
-- view/select: project member
-- create/insert: field+
-- edit/update: field+
-- delete: admin

DROP POLICY IF EXISTS project_member_access ON public.photos;
DROP POLICY IF EXISTS photos_select ON public.photos;
DROP POLICY IF EXISTS photos_insert ON public.photos;
DROP POLICY IF EXISTS photos_update ON public.photos;
DROP POLICY IF EXISTS photos_delete ON public.photos;

CREATE POLICY photos_select
  ON public.photos FOR SELECT
  USING (public.user_has_project_access(project_id));

CREATE POLICY photos_insert
  ON public.photos FOR INSERT
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'field'));

CREATE POLICY photos_update
  ON public.photos FOR UPDATE
  USING (public.user_has_project_role_at_least(project_id, 'field'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'field'));

CREATE POLICY photos_delete
  ON public.photos FOR DELETE
  USING (public.user_has_project_role_at_least(project_id, 'admin'));
