-- GC document register: adopt the shared gc_drawing_sets / gc_drawings tables
-- into Rev.2's migration lineage, then extend them to carry GC-issued document
-- types (ASI, addendum, bulletin, CCD, contract document) and a per-sheet
-- supersession chain.
--
-- OWNERSHIP. CLAUDE.md ("Sibling app: SteelBuild-Pro-2026") says not to add
-- migrations for gc_drawings without the owner's say-so while schema ownership
-- is undecided. Owner decision (2026-09-19): Rev.2 is building the GC Documents
-- section on these tables, and this migration is authorised. A manifest override
-- entry records that authorisation alongside the sibling app's original
-- 20260909033138_m3_6_gc_drawings_register.sql entry.
--
-- WHY AN ADOPT BLOCK. Both tables exist ONLY in production - no DDL for them
-- lives anywhere in this repo, which is why supabase/tests/drift_function_entrypoints.sql
-- has to fabricate a TEMP gc_drawings to exercise sync_gc_drawing_set_counts().
-- The CREATE TABLE IF NOT EXISTS block below re-declares the CURRENT LIVE shape
-- (pulled from information_schema.columns / pg_constraint / pg_indexes /
-- pg_trigger / pg_policies on kjrwqagyeswwoxpjkcko on 2026-09-19) so a fresh
-- `supabase db reset` has them. Against production every statement is a no-op.
-- Same pattern, and same reason, as 20260915120000_adopt_2026_fab_release_gate.sql.
--
-- WHY THE EXTENSION IS SAFE ON A SHARED DATABASE. The sibling app reads and
-- writes these tables live (4 sets / 31 sheets at time of writing). Every added
-- column is either nullable or carries a default that reproduces today's
-- behaviour, and no existing column, constraint, trigger or policy is altered
-- or dropped. A 2026-app INSERT that names none of the new columns keeps
-- working unchanged.
--
-- NOT DONE HERE: the SECURITY DEFINER grant hardening on
-- sync_gc_drawing_set_counts(). 20260912023827 deliberately left it out on
-- ownership grounds and its test asserts that exclusion stays put; applied
-- migrations are byte-immutable. If that revoke now belongs to Rev.2 it needs
-- its own forward migration, argued on its own merits.
--
-- APPLIED OUT OF BAND 2026-09-19. Only the additive half below was executed
-- against production: the seven columns, four constraints and four indexes.
-- The adopt block was not - it is a no-op there except for the DROP/CREATE
-- POLICY pairs, and dropping a live policy on a shared database, even for an
-- instant, leaves RLS denying every read. Its policy text was transcribed from
-- pg_policies the same day and matches what is live. The manifest's
-- local.migrationOverrides entry for this version records the verification.
-- A fresh `supabase db reset` still runs the whole file.
--
-- Apply with `supabase db push`. NOT via MCP apply_migration - that path stamps
-- its own version and is how 45 remote-only versions accumulated in this
-- project's ledger.

-- ── Adopt: gc_drawing_sets ──────────────────────────────────────────────────
-- One row per GC issuance (a CD set, an ASI, an addendum, a contract document).
CREATE TABLE IF NOT EXISTS public.gc_drawing_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  set_name text NOT NULL,
  description text,
  issued_date date,
  category text NOT NULL DEFAULT 'architectural'::text,
  discipline text,
  issued_by text,
  revision text,
  file_url text,
  sheet_count integer NOT NULL DEFAULT 0,
  upload_batch_id uuid,
  titleblock_title_rect jsonb,
  titleblock_number_rect jsonb,
  titleblock_revision_rect jsonb,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gc_drawing_sets_pkey PRIMARY KEY (id),
  CONSTRAINT gc_drawing_sets_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects (id),
  CONSTRAINT gc_drawing_sets_set_name_not_blank CHECK (length(btrim(set_name)) > 0),
  CONSTRAINT gc_drawing_sets_category_check CHECK (category = ANY (ARRAY[
    'architectural'::text, 'structural'::text, 'civil'::text, 'mechanical'::text,
    'electrical'::text, 'plumbing'::text, 'specifications'::text, 'other'::text
  ]))
);

CREATE INDEX IF NOT EXISTS idx_gc_drawing_sets_project
  ON public.gc_drawing_sets (project_id) WHERE (is_deleted = false);

-- ── Adopt: gc_drawings ──────────────────────────────────────────────────────
-- One row per sheet inside an issuance. `revision` is a flat text column: a GC
-- drawing carries exactly one current revision string, unlike a shop sheet,
-- whose history lives in drawing_revisions.
CREATE TABLE IF NOT EXISTS public.gc_drawings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  gc_drawing_set_id uuid NOT NULL,
  drawing_number text,
  title text,
  revision text,
  discipline text,
  file_url text,
  thumbnail_url text,
  pdf_page integer NOT NULL DEFAULT 1,
  upload_status text NOT NULL DEFAULT 'Uploaded'::text,
  ai_extraction_status text NOT NULL DEFAULT 'Pending'::text,
  ai_extraction_source text,
  extracted_text text,
  last_extracted_at timestamptz,
  upload_batch_id uuid,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gc_drawings_pkey PRIMARY KEY (id),
  CONSTRAINT gc_drawings_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects (id),
  CONSTRAINT gc_drawings_gc_drawing_set_id_fkey FOREIGN KEY (gc_drawing_set_id)
    REFERENCES public.gc_drawing_sets (id) ON DELETE CASCADE,
  CONSTRAINT gc_drawings_pdf_page_check CHECK (pdf_page >= 1),
  CONSTRAINT gc_drawings_upload_status_check CHECK (upload_status = ANY (ARRAY[
    'Uploading'::text, 'Uploaded'::text, 'Failed'::text
  ])),
  CONSTRAINT gc_drawings_ai_extraction_status_check CHECK (ai_extraction_status = ANY (ARRAY[
    'Pending'::text, 'Extracting'::text, 'Processed'::text, 'NeedsReview'::text, 'Failed'::text
  ])),
  CONSTRAINT gc_drawings_ai_extraction_source_check CHECK (
    ai_extraction_source IS NULL OR ai_extraction_source = ANY (ARRAY[
      'mapped_rect'::text, 'llm_fallback'::text, 'filename_fallback'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS idx_gc_drawings_project
  ON public.gc_drawings (project_id) WHERE (is_deleted = false);

CREATE INDEX IF NOT EXISTS idx_gc_drawings_set
  ON public.gc_drawings (gc_drawing_set_id);

-- ── Adopt: triggers ─────────────────────────────────────────────────────────
-- sync_gc_drawing_set_counts() keeps gc_drawing_sets.sheet_count truthful. It
-- already exists in production (its body is md5-pinned by
-- 20260913201900_harden_drifted_function_entrypoints.sql) and is NOT
-- re-declared here - only the trigger binding is, and only when the function
-- is present, so a Rev.2-only replay that lacks it degrades to a notice
-- instead of aborting.
DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER trg_gc_drawing_sets_updated_at
      BEFORE UPDATE ON public.gc_drawing_sets
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

    CREATE OR REPLACE TRIGGER trg_gc_drawings_updated_at
      BEFORE UPDATE ON public.gc_drawings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  ELSE
    RAISE NOTICE 'public.update_updated_at() absent - skipping gc_* updated_at triggers';
  END IF;

  IF to_regprocedure('public.sync_gc_drawing_set_counts()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER trg_gc_drawings_sync_counts
      AFTER INSERT OR DELETE OR UPDATE OF gc_drawing_set_id, is_deleted
      ON public.gc_drawings
      FOR EACH ROW EXECUTE FUNCTION public.sync_gc_drawing_set_counts();
  ELSE
    RAISE NOTICE 'public.sync_gc_drawing_set_counts() absent - skipping gc_drawings count trigger';
  END IF;
END $$;

-- ── Adopt: RLS ──────────────────────────────────────────────────────────────
-- Read for anyone on the project; write from PM upward. Matches production
-- exactly. There is deliberately NO delete policy: removal is the soft-delete
-- UPDATE (is_deleted / deleted_at), and hard deletion goes through
-- hard_delete_records(), whose allowlist already names both tables.
ALTER TABLE public.gc_drawing_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gc_drawings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gc_drawing_sets_select ON public.gc_drawing_sets;
CREATE POLICY gc_drawing_sets_select
ON public.gc_drawing_sets
FOR SELECT TO authenticated
USING (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS gc_drawing_sets_insert ON public.gc_drawing_sets;
CREATE POLICY gc_drawing_sets_insert
ON public.gc_drawing_sets
FOR INSERT TO authenticated
WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'::text));

DROP POLICY IF EXISTS gc_drawing_sets_update ON public.gc_drawing_sets;
CREATE POLICY gc_drawing_sets_update
ON public.gc_drawing_sets
FOR UPDATE TO authenticated
USING (public.user_has_project_role_at_least(project_id, 'pm'::text))
WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'::text));

DROP POLICY IF EXISTS gc_drawings_select ON public.gc_drawings;
CREATE POLICY gc_drawings_select
ON public.gc_drawings
FOR SELECT TO authenticated
USING (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS gc_drawings_insert ON public.gc_drawings;
CREATE POLICY gc_drawings_insert
ON public.gc_drawings
FOR INSERT TO authenticated
WITH CHECK (
  public.user_has_project_role_at_least(project_id, 'pm'::text)
  AND gc_drawing_set_id IN (
    SELECT s.id FROM public.gc_drawing_sets s WHERE s.project_id = gc_drawings.project_id
  )
);

DROP POLICY IF EXISTS gc_drawings_update ON public.gc_drawings;
CREATE POLICY gc_drawings_update
ON public.gc_drawings
FOR UPDATE TO authenticated
USING (public.user_has_project_role_at_least(project_id, 'pm'::text))
WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'::text));

REVOKE ALL ON TABLE public.gc_drawing_sets FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.gc_drawings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gc_drawing_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gc_drawings TO authenticated;
GRANT ALL ON TABLE public.gc_drawing_sets TO service_role;
GRANT ALL ON TABLE public.gc_drawings TO service_role;

-- ── Extend: what kind of GC document is this ────────────────────────────────
-- `category` is a DISCIPLINE (architectural / structural / civil / …), not a
-- document type, so an ASI and a 100% CD set are indistinguishable today. The
-- vocabulary below is the one this repo already carries as prose, in the
-- COMMENT ON COLUMN public.drawing_revisions.revision_source added by
-- 20260725193000_submittal_comment_dispositions.sql: "GC/Architect/Engineer
-- comments, RFI, Bulletin, ASI, CCD, Addendum, CO, …".
ALTER TABLE public.gc_drawing_sets
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'gc_drawing',
  ADD COLUMN IF NOT EXISTS doc_number text,
  ADD COLUMN IF NOT EXISTS received_date date,
  ADD COLUMN IF NOT EXISTS steel_impact text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS impact_notes text;

COMMENT ON COLUMN public.gc_drawing_sets.doc_type IS
  'What kind of GC-issued document this issuance is. Defaults to gc_drawing so rows predating this column keep their current meaning.';
COMMENT ON COLUMN public.gc_drawing_sets.doc_number IS
  'The issuing party''s own reference for this document - "ASI 012", "Addendum 3", "Bulletin 5". Free text: it is the GC''s numbering, not ours, and is never minted here.';
COMMENT ON COLUMN public.gc_drawing_sets.received_date IS
  'When WE received the document. Distinct from issued_date (the date on the document) - the gap between them is the notice we actually got.';
COMMENT ON COLUMN public.gc_drawing_sets.steel_impact IS
  'Whether this issuance affects steel scope. Defaults to unknown, NEVER none: an un-reviewed ASI has not been cleared, it has not been looked at.';

ALTER TABLE public.gc_drawing_sets
  DROP CONSTRAINT IF EXISTS gc_drawing_sets_doc_type_check;
ALTER TABLE public.gc_drawing_sets
  ADD CONSTRAINT gc_drawing_sets_doc_type_check CHECK (doc_type = ANY (ARRAY[
    'gc_drawing'::text,
    'asi'::text,
    'addendum'::text,
    'bulletin'::text,
    'ccd'::text,
    'revision'::text,
    'contract_document'::text,
    'specification'::text
  ])) NOT VALID;
ALTER TABLE public.gc_drawing_sets
  VALIDATE CONSTRAINT gc_drawing_sets_doc_type_check;

ALTER TABLE public.gc_drawing_sets
  DROP CONSTRAINT IF EXISTS gc_drawing_sets_steel_impact_check;
ALTER TABLE public.gc_drawing_sets
  ADD CONSTRAINT gc_drawing_sets_steel_impact_check CHECK (steel_impact = ANY (ARRAY[
    'unknown'::text,
    'pending_review'::text,
    'none'::text,
    'impacted'::text
  ])) NOT VALID;
ALTER TABLE public.gc_drawing_sets
  VALIDATE CONSTRAINT gc_drawing_sets_steel_impact_check;

CREATE INDEX IF NOT EXISTS idx_gc_drawing_sets_project_doc_type
  ON public.gc_drawing_sets (project_id, doc_type) WHERE (is_deleted = false);

CREATE INDEX IF NOT EXISTS idx_gc_drawing_sets_project_steel_impact
  ON public.gc_drawing_sets (project_id, steel_impact) WHERE (is_deleted = false);

-- ── Extend: per-sheet supersession ──────────────────────────────────────────
-- When ASI 012 reissues S-301, the S-301 that came with the CD set is no longer
-- the sheet of record. Without this, both stay live and the register cannot say
-- which one the shop should be reading - the same failure mode CLAUDE.md
-- describes for shop sets ("the old pages stay live unless something explicitly
-- marks them superseded").
--
-- The FK is self-referential and ON DELETE SET NULL: losing the successor must
-- not cascade away the sheet that records the supersession.
ALTER TABLE public.gc_drawings
  ADD COLUMN IF NOT EXISTS is_superseded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid;

COMMENT ON COLUMN public.gc_drawings.is_superseded IS
  'True once a later GC issuance reissued this sheet number. Defaults false: a sheet nobody has reissued is current.';
COMMENT ON COLUMN public.gc_drawings.superseded_by_id IS
  'The gc_drawings row that replaced this one, when known. NULL while is_superseded is false, and also when the successor is outside this register - absence here is not proof the sheet is current, is_superseded is.';

ALTER TABLE public.gc_drawings
  DROP CONSTRAINT IF EXISTS gc_drawings_superseded_by_id_fkey;
ALTER TABLE public.gc_drawings
  ADD CONSTRAINT gc_drawings_superseded_by_id_fkey FOREIGN KEY (superseded_by_id)
    REFERENCES public.gc_drawings (id) ON DELETE SET NULL;

-- A sheet cannot supersede itself.
ALTER TABLE public.gc_drawings
  DROP CONSTRAINT IF EXISTS gc_drawings_superseded_by_not_self;
ALTER TABLE public.gc_drawings
  ADD CONSTRAINT gc_drawings_superseded_by_not_self
    CHECK (superseded_by_id IS NULL OR superseded_by_id <> id) NOT VALID;
ALTER TABLE public.gc_drawings
  VALIDATE CONSTRAINT gc_drawings_superseded_by_not_self;

CREATE INDEX IF NOT EXISTS idx_gc_drawings_superseded_by
  ON public.gc_drawings (superseded_by_id) WHERE (superseded_by_id IS NOT NULL);

-- Current sheets for a project - the register's default read.
CREATE INDEX IF NOT EXISTS idx_gc_drawings_project_current
  ON public.gc_drawings (project_id) WHERE (is_deleted = false AND is_superseded = false);

NOTIFY pgrst, 'reload schema';
