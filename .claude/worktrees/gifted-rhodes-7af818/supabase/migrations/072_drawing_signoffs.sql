-- 072_drawing_signoffs.sql — Additive sign-off stamps on drawing revisions
--
-- Tracks the formal review stamps a checker / engineer applies to a drawing
-- revision: approved-for-fab, approved-as-noted, revise-and-resubmit, etc.
-- Stamps are append-only (a void is a separate row update, not a delete) so
-- the revision's audit trail survives indefinitely.
--
-- Geometry columns (pdf_page, x, y, width, height, rotation_deg) are
-- present from day one but optional — V1 records metadata only and renders
-- chips in a side panel. V2 will use them to place the stamp on the PDF.

CREATE TABLE IF NOT EXISTS public.drawing_signoffs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  drawing_revision_id uuid NOT NULL REFERENCES public.drawing_revisions(id) ON DELETE CASCADE,
  drawing_id          uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  stamp_type          text NOT NULL CHECK (stamp_type IN (
    'approved_for_fabrication','approved_as_noted','revise_and_resubmit',
    'rejected','reviewed','for_information_only','void'
  )),
  pdf_page            integer,
  x                   numeric CHECK (x BETWEEN 0 AND 1),
  y                   numeric CHECK (y BETWEEN 0 AND 1),
  width               numeric,
  height              numeric,
  rotation_deg        numeric DEFAULT 0,
  stamped_by_id       uuid REFERENCES auth.users(id),
  stamped_by_name     text,
  stamped_at          timestamptz NOT NULL DEFAULT now(),
  notes               text,
  signature_url       text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_voided           boolean NOT NULL DEFAULT false,
  voided_at           timestamptz,
  voided_by           uuid REFERENCES auth.users(id),
  voided_reason       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drawing_signoffs_revision ON public.drawing_signoffs(drawing_revision_id) WHERE is_voided = false;
CREATE INDEX IF NOT EXISTS idx_drawing_signoffs_drawing  ON public.drawing_signoffs(drawing_id) WHERE is_voided = false;
CREATE INDEX IF NOT EXISTS idx_drawing_signoffs_project  ON public.drawing_signoffs(project_id);

ALTER TABLE public.drawing_signoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drawing_signoffs_project_access ON public.drawing_signoffs;
CREATE POLICY drawing_signoffs_project_access
  ON public.drawing_signoffs
  FOR ALL
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));
