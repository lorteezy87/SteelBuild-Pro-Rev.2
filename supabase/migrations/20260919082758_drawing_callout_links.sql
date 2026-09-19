-- drawing_callout_links -- Section Cut <-> Sheet reference index.
--
-- TRANSCRIBED, NOT AUTHORED. This statement was applied to production
-- kjrwqagyeswwoxpjkcko on 2026-09-19 08:27:58 UTC and stamped as version
-- 20260919082758, but the file was never committed -- PR #437 shipped
-- src/lib/sectionCutLinks.ts without it. The body below is copied verbatim
-- from supabase_migrations.schema_migrations.statements for that version, so
-- the repo reproduces exactly what the database already ran. Do not "tidy" it
-- to match house style: its value is that it is byte-faithful to production.
--
-- Until this landed, `supabase:drift` reported it as an unknownMigration,
-- which is a blocking CI gate -- so it also blocked the gated production
-- deploy for every branch, not just the one that introduced it.
--
-- The statement is idempotent (IF NOT EXISTS / OR REPLACE / DROP ... IF
-- EXISTS before each CREATE POLICY), so replaying it on a fresh
-- `supabase db reset` is safe and a no-op against production.

CREATE TABLE IF NOT EXISTS public.drawing_callout_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  target_sheet_key text NOT NULL CHECK (length(btrim(target_sheet_key)) > 0),
  target_as_printed text NOT NULL,
  target_drawing_id uuid REFERENCES public.drawings(id) ON DELETE SET NULL,
  detail_number text,
  raw_text text NOT NULL,
  coords jsonb,
  link_source text NOT NULL DEFAULT 'detected'
    CHECK (link_source IN ('detected', 'manual')),
  created_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.drawing_callout_links IS
  'Indexed projection of Section Cut <-> Sheet references for filtering and search. NOT the resolution source of truth: src/lib/sectionCutLinks.ts resolves by sheet number against the live register so late uploads resolve and renumbered sheets correctly go unresolved. target_drawing_id is a filtering cache only.';

COMMENT ON COLUMN public.drawing_callout_links.target_drawing_id IS
  'Filtering cache. NULL means the target sheet is not in the register. Never use this to decide what a printed callout points at.';

CREATE UNIQUE INDEX IF NOT EXISTS drawing_callout_links_identity_uidx
  ON public.drawing_callout_links (source_drawing_id, target_sheet_key, COALESCE(detail_number, ''));

CREATE INDEX IF NOT EXISTS drawing_callout_links_target_key_idx
  ON public.drawing_callout_links (project_id, target_sheet_key);

CREATE INDEX IF NOT EXISTS drawing_callout_links_source_idx
  ON public.drawing_callout_links (project_id, source_drawing_id);

CREATE INDEX IF NOT EXISTS drawing_callout_links_target_id_idx
  ON public.drawing_callout_links (target_drawing_id)
  WHERE target_drawing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS drawing_callout_links_raw_text_idx
  ON public.drawing_callout_links USING gin (to_tsvector('simple', raw_text));

CREATE OR REPLACE FUNCTION public.touch_drawing_callout_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_callout_links_touch ON public.drawing_callout_links;
CREATE TRIGGER trg_drawing_callout_links_touch
  BEFORE UPDATE ON public.drawing_callout_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_drawing_callout_links();

ALTER TABLE public.drawing_callout_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drawing_callout_links_select ON public.drawing_callout_links;
CREATE POLICY drawing_callout_links_select
ON public.drawing_callout_links
FOR SELECT TO authenticated
USING (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS drawing_callout_links_insert ON public.drawing_callout_links;
CREATE POLICY drawing_callout_links_insert
ON public.drawing_callout_links
FOR INSERT TO authenticated
WITH CHECK (
  public.user_has_project_role_at_least(project_id, 'pm'::text)
  AND source_drawing_id IN (
    SELECT d.id FROM public.drawings d WHERE d.project_id = drawing_callout_links.project_id
  )
);

DROP POLICY IF EXISTS drawing_callout_links_update ON public.drawing_callout_links;
CREATE POLICY drawing_callout_links_update
ON public.drawing_callout_links
FOR UPDATE TO authenticated
USING (public.user_has_project_role_at_least(project_id, 'pm'::text))
WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'::text));

DROP POLICY IF EXISTS drawing_callout_links_delete ON public.drawing_callout_links;
CREATE POLICY drawing_callout_links_delete
ON public.drawing_callout_links
FOR DELETE TO authenticated
USING (public.user_has_project_role_at_least(project_id, 'pm'::text));

REVOKE ALL ON TABLE public.drawing_callout_links FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.drawing_callout_links TO authenticated;
