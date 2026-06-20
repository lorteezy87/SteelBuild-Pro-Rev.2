-- 20260526240000_drawing_control_module.sql
-- Drawing Register / Document Control module — ADDITIVE on the existing
-- drawings / drawing_revisions / drawing_links schema. No existing table is
-- recreated. Membership = user_projects via user_has_project_access(). Status
-- sets use text+CHECK to match codebase convention (drawings.stage,
-- drawing_sets.detailing_state). release_status is a standalone per-revision
-- field that COEXISTS with the set-level detailing_state + submittal workflow
-- (not derived). Applied live via Supabase MCP (user-authorized "full
-- migration"). Pre-flight confirmed: update_updated_at() exists,
-- ux_drawing_revisions_one_current exists, 0 drawings with multiple current
-- revisions. Register view returned 255 drawings post-apply.

-- (1) Release lifecycle on revisions ----------------------------------------
ALTER TABLE public.drawing_revisions
  ADD COLUMN IF NOT EXISTS release_status text NOT NULL DEFAULT 'received';
ALTER TABLE public.drawing_revisions
  DROP CONSTRAINT IF EXISTS drawing_revisions_release_status_check;
ALTER TABLE public.drawing_revisions
  ADD CONSTRAINT drawing_revisions_release_status_check
  CHECK (release_status IN (
    'received','pending_review','reviewed','released_for_estimate',
    'released_for_shop','released_for_field','on_hold','superseded','void'));
CREATE INDEX IF NOT EXISTS idx_drawing_revisions_release_status
  ON public.drawing_revisions (project_id, release_status);

-- (2) Transmittal / distribution log ----------------------------------------
CREATE TABLE IF NOT EXISTS public.drawing_transmittals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  transmittal_number text NOT NULL,
  direction text NOT NULL DEFAULT 'incoming'
    CHECK (direction IN ('incoming','outgoing','internal')),
  source_company text, received_from text, sent_to text, subject text,
  date_sent timestamptz, date_received timestamptz, notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_project_transmittal UNIQUE (project_id, transmittal_number));
CREATE INDEX IF NOT EXISTS idx_drawing_transmittals_project ON public.drawing_transmittals(project_id);

CREATE TABLE IF NOT EXISTS public.drawing_transmittal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  transmittal_id uuid NOT NULL REFERENCES public.drawing_transmittals(id) ON DELETE CASCADE,
  drawing_revision_id uuid NOT NULL REFERENCES public.drawing_revisions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_transmittal_revision UNIQUE (transmittal_id, drawing_revision_id));
CREATE INDEX IF NOT EXISTS idx_transmittal_items_transmittal ON public.drawing_transmittal_items(transmittal_id);
CREATE INDEX IF NOT EXISTS idx_transmittal_items_revision ON public.drawing_transmittal_items(drawing_revision_id);

-- (3) Role-based review gates -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.drawing_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  drawing_revision_id uuid NOT NULL REFERENCES public.drawing_revisions(id) ON DELETE CASCADE,
  review_role text NOT NULL
    CHECK (review_role IN ('project_manager','detailer','shop','field_ops','document_control','executive')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending','approved','approved_with_notes','rejected','not_required')),
  comments text, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_revision_review_role UNIQUE (drawing_revision_id, review_role));
CREATE INDEX IF NOT EXISTS idx_drawing_reviews_revision ON public.drawing_reviews(drawing_revision_id);
CREATE INDEX IF NOT EXISTS idx_drawing_reviews_project ON public.drawing_reviews(project_id);

-- (4) Stored, assignable impacts (complements the derived read-model in
--     src/lib/detailingReadiness.js) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.drawing_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  drawing_revision_id uuid NOT NULL REFERENCES public.drawing_revisions(id) ON DELETE CASCADE,
  impact_type text NOT NULL CHECK (impact_type IN (
    'fabrication','erection','embed','anchor_bolts','connections','material_takeoff',
    'shop_drawing_required','rfi_followup','change_order','field_rework')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_review','ready','blocked','resolved','closed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  title text NOT NULL, notes text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date date, resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_drawing_impacts_revision ON public.drawing_impacts(drawing_revision_id);
CREATE INDEX IF NOT EXISTS idx_drawing_impacts_project_status ON public.drawing_impacts(project_id, status);
CREATE INDEX IF NOT EXISTS idx_drawing_impacts_assigned ON public.drawing_impacts(assigned_to);

-- (5) Markups (drawings.markup jsonb stays for the viewer overlay) ----------
CREATE TABLE IF NOT EXISTS public.drawing_markups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  drawing_revision_id uuid NOT NULL REFERENCES public.drawing_revisions(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  markup_type text NOT NULL CHECK (markup_type IN ('cloud','pin','dimension_note','qa_note','field_note','coordination_note')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','void')),
  page_number integer NOT NULL DEFAULT 1 CHECK (page_number > 0),
  page_x numeric(12,4), page_y numeric(12,4), width numeric(12,4), height numeric(12,4),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_drawing_markups_revision ON public.drawing_markups(drawing_revision_id);

-- (6) Watchers / subscriptions ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.drawing_watchers (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watch_type text NOT NULL DEFAULT 'all_updates'
    CHECK (watch_type IN ('all_updates','revision_only','field_release_only','impact_only')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (drawing_id, user_id));
CREATE INDEX IF NOT EXISTS idx_drawing_watchers_user ON public.drawing_watchers(user_id);

-- updated_at triggers (only the tables that carry updated_at) ----------------
CREATE OR REPLACE TRIGGER trg_drawing_transmittals_updated_at BEFORE UPDATE ON public.drawing_transmittals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE TRIGGER trg_drawing_reviews_updated_at      BEFORE UPDATE ON public.drawing_reviews      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE TRIGGER trg_drawing_impacts_updated_at      BEFORE UPDATE ON public.drawing_impacts      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE TRIGGER trg_drawing_markups_updated_at      BEFORE UPDATE ON public.drawing_markups      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS: 5 content tables get one project-membership policy per command (matches
-- the consolidated pattern). Watchers are readable by project members but
-- writable only for one's own row.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['drawing_transmittals','drawing_transmittal_items','drawing_reviews','drawing_impacts','drawing_markups']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$CREATE POLICY project_select ON public.%I FOR SELECT TO authenticated USING (user_has_project_access(project_id));$f$, t);
    EXECUTE format($f$CREATE POLICY project_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (user_has_project_access(project_id));$f$, t);
    EXECUTE format($f$CREATE POLICY project_update ON public.%I FOR UPDATE TO authenticated USING (user_has_project_access(project_id)) WITH CHECK (user_has_project_access(project_id));$f$, t);
    EXECUTE format($f$CREATE POLICY project_delete ON public.%I FOR DELETE TO authenticated USING (user_has_project_access(project_id));$f$, t);
  END LOOP;
END $$;

ALTER TABLE public.drawing_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY watchers_select ON public.drawing_watchers FOR SELECT TO authenticated
  USING (user_has_project_access(project_id));
CREATE POLICY watchers_insert ON public.drawing_watchers FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND user_has_project_access(project_id));
CREATE POLICY watchers_update ON public.drawing_watchers FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY watchers_delete ON public.drawing_watchers FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Register view (security_invoker → the caller's RLS on the base tables applies)
CREATE OR REPLACE VIEW public.drawing_register_view
WITH (security_invoker = true) AS
SELECT
  d.id AS drawing_id, d.project_id, d.sheet_number, d.title AS sheet_title,
  d.discipline, d.drawing_set_name, d.stage,
  cur.id AS current_revision_id, cur.revision_code AS current_revision,
  cur.release_status AS current_status, cur.issued_at AS current_issued_at,
  (SELECT count(*) FROM public.drawing_impacts i
     WHERE i.drawing_revision_id = cur.id AND i.status NOT IN ('resolved','closed')) AS open_impact_count,
  (SELECT count(*) FROM public.drawing_reviews r
     WHERE r.drawing_revision_id = cur.id AND r.decision = 'pending') AS pending_review_count,
  (SELECT count(*) FROM public.drawing_links l
     WHERE l.drawing_id = d.id AND l.linked_record_type = 'rfi' AND l.removed_at IS NULL) AS rfi_count,
  (SELECT count(*) FROM public.drawing_links l
     WHERE l.drawing_id = d.id AND l.linked_record_type = 'work_package' AND l.removed_at IS NULL) AS work_package_count,
  GREATEST(d.updated_at, cur.updated_at) AS last_activity
FROM public.drawings d
LEFT JOIN LATERAL (
  SELECT * FROM public.drawing_revisions r WHERE r.drawing_id = d.id AND r.is_current = true LIMIT 1
) cur ON true
WHERE d.is_deleted = false;

-- Publish RPC: promote a revision to current + set release status (supersedes
-- the prior current revision). SECURITY DEFINER but gated by an explicit
-- membership check, fixed search_path, EXECUTE granted only to authenticated.
CREATE OR REPLACE FUNCTION public.publish_drawing_revision(
  p_revision_id uuid,
  p_release_status text DEFAULT 'released_for_field'
) RETURNS public.drawing_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rev public.drawing_revisions;
  v_project uuid;
  v_drawing uuid;
BEGIN
  SELECT project_id, drawing_id INTO v_project, v_drawing
  FROM public.drawing_revisions WHERE id = p_revision_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;
  IF NOT public.user_has_project_access(v_project) THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;
  IF p_release_status NOT IN ('released_for_estimate','released_for_shop','released_for_field','reviewed') THEN
    RAISE EXCEPTION 'Invalid publish status: %', p_release_status;
  END IF;

  UPDATE public.drawing_revisions
     SET is_current = false, release_status = 'superseded', updated_at = now()
   WHERE drawing_id = v_drawing AND id <> p_revision_id AND is_current = true;

  UPDATE public.drawing_revisions
     SET is_current = true, release_status = p_release_status, updated_at = now()
   WHERE id = p_revision_id
  RETURNING * INTO v_rev;

  RETURN v_rev;
END $fn$;

REVOKE ALL ON FUNCTION public.publish_drawing_revision(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.publish_drawing_revision(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
