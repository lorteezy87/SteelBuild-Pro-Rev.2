-- APPLIED 2026-09-19 as ledger version 20260919082758 (name: drawing_callout_links).
-- This file is named for the STAMPED version, not the authoring timestamp: the
-- drift check compares local migration versions against the remote ledger, and
-- a local file whose version is absent from the ledger is reported missing and
-- fails closed. Verified post-apply: RLS enabled, 4 policies, 6 indexes, 0 anon
-- grants, 0 security-advisor findings against this table.
--
-- drawing_callout_links — the indexed projection of Section Cut ↔ Sheet
-- cross-references, for FILTERING and SEARCH at register scale.
--
-- WHAT THIS TABLE IS NOT
-- ---------------------
-- It is not the source of truth for whether a callout resolves, and the viewer
-- must never trust `target_drawing_id` to decide what a reference points at.
--
-- Resolution belongs to src/lib/sectionCutLinks.ts, which matches on the sheet
-- NUMBER against the live register at read time. That is deliberate and it is
-- why two things work today:
--
--   * A callout printed "3/S-401" starts resolving the MOMENT S-401 is
--     uploaded, weeks later, with no rebuild job. A stored target id written at
--     import would have been NULL forever.
--   * A sheet RENUMBERED S-401 → S-401A correctly goes unresolved. The issued
--     PDF still says "3/S-401"; silently retargeting the link would route a
--     detailer to a sheet the drawing never pointed at, which is how somebody
--     fabricates to a superseded detail.
--
-- `target_drawing_id` here is a CACHE, refreshed with the projection, so the
-- register can answer "show me every sheet that references S-401" with an
-- indexed join instead of scanning jsonb. It is nullable on purpose: an
-- unresolved link is a real row, because a dangling reference is a
-- coordination finding, not noise. Deleting the target sets it NULL and leaves
-- the row — the callout is still printed on the paper.
--
-- source_drawing_id cascades: if the referencing sheet is gone, the reference
-- it printed is gone with it.
--
-- Additive only. Nothing existing is altered or dropped; `drawings.callouts`
-- stays exactly as it is and remains the harvested evidence this projects from.

CREATE TABLE IF NOT EXISTS public.drawing_callout_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- The sheet the reference is PRINTED ON.
  source_drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,

  -- Canonical key of the target, per sheetKey()/calloutSheetKey()/normalizeSN:
  -- upper-cased with space, hyphen, underscore and dot removed. Stored rather
  -- than computed so the index is usable and so the three JS copies of that
  -- rule cannot drift from what the database matched on.
  target_sheet_key text NOT NULL CHECK (length(btrim(target_sheet_key)) > 0),

  -- The target sheet number exactly as printed on the source sheet. Kept so a
  -- dangling reference can be shown as the drawing shows it.
  target_as_printed text NOT NULL,

  -- Filtering cache only. NULL = the target is not in the register (never
  -- uploaded, or renumbered since this sheet was issued).
  target_drawing_id uuid REFERENCES public.drawings(id) ON DELETE SET NULL,

  -- The detail/section bubble number: the "3" in "3/S-401". NULL when the
  -- reference carried none ("SEE S-401"). Part of link identity.
  detail_number text,

  -- The reference exactly as printed, for display and audit.
  raw_text text NOT NULL,

  -- Page box in PDF user units, measured DOWN from the page top, matching
  -- drawings.callouts[].coords. NULL for a manual link, which has no position
  -- on the sheet.
  coords jsonb,

  -- 'detected' = machine-read from the sheet's text layer.
  -- 'manual'   = a person asserted it. Re-detection must never delete these;
  --              machine evidence and human attestation stay separable, the
  --              same rule docControl applies to seals and signatures.
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

-- Identity: one link per (source sheet, target sheet, detail number).
-- The same reference printed twice on one sheet is ONE link; "3/S-401" and
-- "4/S-401" are two. coalesce() because NULL never equals NULL in a unique
-- constraint, which would let "SEE S-401" be inserted without limit.
CREATE UNIQUE INDEX IF NOT EXISTS drawing_callout_links_identity_uidx
  ON public.drawing_callout_links (source_drawing_id, target_sheet_key, COALESCE(detail_number, ''));

-- Reverse lookup: "what references this sheet?" resolved by KEY, so a sheet
-- uploaded after the referencing sheet still matches without a rebuild.
CREATE INDEX IF NOT EXISTS drawing_callout_links_target_key_idx
  ON public.drawing_callout_links (project_id, target_sheet_key);

-- Forward listing and per-sheet refresh.
CREATE INDEX IF NOT EXISTS drawing_callout_links_source_idx
  ON public.drawing_callout_links (project_id, source_drawing_id);

-- Register filtering by resolved target. Partial: unresolved rows are the
-- majority on a part-uploaded set and are never the subject of this join.
CREATE INDEX IF NOT EXISTS drawing_callout_links_target_id_idx
  ON public.drawing_callout_links (target_drawing_id)
  WHERE target_drawing_id IS NOT NULL;

-- Global search over the printed reference text.
CREATE INDEX IF NOT EXISTS drawing_callout_links_raw_text_idx
  ON public.drawing_callout_links USING gin (to_tsvector('simple', raw_text));

-- updated_at maintenance, matching the project's existing trigger convention.
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

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Explicit per-role policies, no blanket-true. auth.uid() is not referenced
-- directly here; project access goes through the existing helpers, which is
-- also what keeps this clear of the auth_rls_initplan pattern.
ALTER TABLE public.drawing_callout_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drawing_callout_links_select ON public.drawing_callout_links;
CREATE POLICY drawing_callout_links_select
ON public.drawing_callout_links
FOR SELECT TO authenticated
USING (public.user_has_project_access(project_id));

-- Writes are PM+. A link asserts that one issued drawing points at another,
-- which drives what a detailer opens next; a viewer must not be able to mint
-- one. The source sheet must belong to the same project as the row, so a
-- caller cannot attach a link to another tenant's sheet.
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
