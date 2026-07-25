-- ── Returned-comment dispositions (drawing approval lifecycle, Slice 5) ─────
--
-- Structured checklist for comments returned with Approved-as-Noted / R&R.
-- Gates OFS→IFC and R&R→OFA while required rows remain unresolved
-- (client: src/lib/commentDispositionGate.ts). Sheet-level
-- submittal_sheet_responses remain the per-sheet disposition SoT.
--
-- Also adds revision_source / revision_reason on drawing_revisions so
-- revision history can record why a change happened (additive, nullable).

CREATE TABLE IF NOT EXISTS public.submittal_comment_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  submittal_id uuid NOT NULL REFERENCES public.submittals(id) ON DELETE CASCADE,
  submittal_round_id uuid NOT NULL REFERENCES public.submittal_rounds(id) ON DELETE CASCADE,
  drawing_id uuid REFERENCES public.drawings(id) ON DELETE SET NULL,
  comment_number text,
  source text,
  location text,
  comment_text text,
  responsible_user_id uuid,
  required_action text,
  is_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'Unreviewed',
  resolution text,
  related_rfi_id uuid REFERENCES public.rfis(id) ON DELETE SET NULL,
  related_piece_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  incorporated_revision text,
  completed_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  CONSTRAINT submittal_comment_dispositions_status_check CHECK (
    status = ANY (ARRAY[
      'Unreviewed'::text,
      'Accepted'::text,
      'Incorporated'::text,
      'Clarification Required'::text,
      'RFI Required'::text,
      'Not Applicable'::text,
      'Disputed'::text,
      'Complete'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS idx_comment_dispositions_project
  ON public.submittal_comment_dispositions (project_id);
CREATE INDEX IF NOT EXISTS idx_comment_dispositions_submittal
  ON public.submittal_comment_dispositions (submittal_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_comment_dispositions_round
  ON public.submittal_comment_dispositions (submittal_round_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_comment_dispositions_unresolved
  ON public.submittal_comment_dispositions (submittal_id, status)
  WHERE is_deleted = false AND is_required = true
    AND status NOT IN ('Complete', 'Not Applicable', 'Incorporated');

CREATE TRIGGER trg_comment_dispositions_updated_at
  BEFORE UPDATE ON public.submittal_comment_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.tg_submittal_rounds_updated_at();

ALTER TABLE public.submittal_comment_dispositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY submittal_comment_dispositions_select
  ON public.submittal_comment_dispositions
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));

CREATE POLICY submittal_comment_dispositions_insert
  ON public.submittal_comment_dispositions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'field'));

CREATE POLICY submittal_comment_dispositions_update
  ON public.submittal_comment_dispositions
  FOR UPDATE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'field'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'field'));

CREATE POLICY submittal_comment_dispositions_delete
  ON public.submittal_comment_dispositions
  FOR DELETE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'field'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submittal_comment_dispositions TO authenticated;
GRANT ALL ON public.submittal_comment_dispositions TO service_role;

-- Verification floor: only pm+ may set / clear verified_by / verified_at.
CREATE OR REPLACE FUNCTION public.enforce_comment_disposition_verify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
begin
  if new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at then
    if not public.user_has_project_role_at_least(new.project_id, 'pm') then
      raise exception
        'COMMENT_DISPOSITION_VERIFY_BLOCKED: Only PM+ may verify returned-comment dispositions.';
    end if;
  end if;
  return new;
end;
$$;

CREATE TRIGGER trg_comment_dispositions_verify
  BEFORE UPDATE ON public.submittal_comment_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_comment_disposition_verify();

-- Include new table in project soft-delete cascade (same list as baseline + this table).
CREATE OR REPLACE FUNCTION public.soft_delete_project(p_project_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_at timestamptz := now();
  v_table text;
  v_child_tables text[] := array[
    'rfis','change_orders','deliveries','work_packages','documents','drawings',
    'drawing_sets','expenses','inspections','punchlist_items','safety_incidents',
    'scope_items','sov_items','contacts','meetings','model_elements','submittals',
    'submittal_rounds','submittal_sheet_responses','submittal_comment_dispositions',
    'comments','document_folders',
    'daily_logs','photos','quality_control_records','budget_hour_items','risks',
    'email_messages','linked_folders','document_import_queue'
  ];
BEGIN
  IF NOT public.user_has_project_role_at_least(p_project_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized to delete project %', p_project_id USING ERRCODE = '42501';
  END IF;

  FOREACH v_table IN ARRAY v_child_tables LOOP
    EXECUTE format(
      'update public.%I set is_deleted = true, deleted_at = $1 where project_id = $2 and is_deleted = false',
      v_table
    ) USING v_deleted_at, p_project_id;
  END LOOP;

  UPDATE public.projects SET is_deleted = true, deleted_at = v_deleted_at WHERE id = p_project_id;
END;
$$;

-- Revision source / reason metadata (additive, nullable).
ALTER TABLE public.drawing_revisions
  ADD COLUMN IF NOT EXISTS revision_source text,
  ADD COLUMN IF NOT EXISTS revision_reason text;

COMMENT ON COLUMN public.drawing_revisions.revision_source IS
  'Where the revision originated (GC/Architect/Engineer comments, RFI, Bulletin, ASI, CCD, Addendum, CO, field condition, internal, vendor, detailer, …).';
COMMENT ON COLUMN public.drawing_revisions.revision_reason IS
  'Why this revision was issued — free-text companion to revision_source.';
COMMENT ON TABLE public.submittal_comment_dispositions IS
  'Structured returned-comment dispositions for AAN/R&R cycles; gates OFS→IFC and R&R→OFA when required rows are unresolved.';
