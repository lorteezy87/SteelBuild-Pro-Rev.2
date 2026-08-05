-- 20260704020000_submittal_components_drawing_types.sql
--
-- Phase 4 of the phased submittal-logic integration: per-DRAWING-TYPE
-- (Shop / Erection / Part) independent "received" + "released-for-fabrication"
-- tracking. A submittal carries up to 3 components, each with its own
-- received_date + released_date, so Shop can be released while Erection waits.
--
-- Mirrors the standalone tracker model (C:\dev\SteelBuild-Submittal-Tracker,
-- migration 0001_init.sql `submittal_components` table). The only structural
-- difference: the tracker is single-user (owner = auth.uid()) whereas SB Pro is
-- multi-tenant + project-scoped, so this table is keyed by project_id and its
-- RLS mirrors the existing `submittal_rounds` per-project policies (SELECT via
-- user_has_project_access; INSERT/UPDATE/DELETE via
-- user_has_project_role_at_least(project_id, 'field')) exactly.
--
-- This release-per-type is a NEW, PARALLEL concern. It is INDEPENDENT of
-- `submittals.status` and is NOT wired into the fab-release gate
-- (enforce_fab_release_gate / enforce_submittal_fab_release_gate /
-- fab_release_log) — that server-side P0 gate is deliberately left untouched.
--
-- Additive + idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT
-- EXISTS / guarded policy drops) — safe to re-run.
--
-- NOT YET APPLIED to prod (kjrwqagyeswwoxpjkcko). The parent coordinates the
-- apply_migration + schema_migrations lockstep at review time.

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.submittal_components (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL,
  submittal_id  uuid NOT NULL REFERENCES public.submittals(id) ON DELETE CASCADE,
  drawing_type  text NOT NULL CHECK (drawing_type IN ('Shop', 'Erection', 'Part')),
  received_date date,
  released_date date,
  is_released   boolean NOT NULL DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- One component row per (submittal, drawing type): a submittal can have at
  -- most one Shop, one Erection, one Part row. The UI upserts against this.
  UNIQUE (submittal_id, drawing_type)
);

-- FK to projects so an archived/deleted project cascade-removes its component
-- rows (matches submittal_rounds / submittal_activity ON DELETE CASCADE).
ALTER TABLE public.submittal_components
  DROP CONSTRAINT IF EXISTS submittal_components_project_id_fkey;
ALTER TABLE public.submittal_components
  ADD CONSTRAINT submittal_components_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Lookup indexes: "components of submittal X" (the detail-panel + chip read)
-- and project-scoped reads (the entity client filters by project_id).
CREATE INDEX IF NOT EXISTS idx_submittal_components_submittal_id
  ON public.submittal_components USING btree (submittal_id);
CREATE INDEX IF NOT EXISTS idx_submittal_components_project_id
  ON public.submittal_components USING btree (project_id);

COMMENT ON TABLE public.submittal_components IS
  'Phase 4 submittal-logic integration: one row per drawing type (Shop/Erection/Part) present on a submittal, each with its own received_date + released_date/is_released. Release-per-type is INDEPENDENT of submittals.status and is NOT part of the fab-release gate.';
COMMENT ON COLUMN public.submittal_components.is_released IS
  'Phase 4: this drawing type has been released for fabrication. Parallel to (NOT part of) the fab_release_log / enforce_fab_release_gate P0 path.';

-- ── updated_at trigger ────────────────────────────────────────────────────────
-- Reuse the shared public.update_updated_at() (already SET search_path TO
-- 'public'); same convention as trg_submittals_updated_at et al. No new function.
DROP TRIGGER IF EXISTS trg_submittal_components_updated_at ON public.submittal_components;
CREATE TRIGGER trg_submittal_components_updated_at
  BEFORE UPDATE ON public.submittal_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Row-level security ────────────────────────────────────────────────────────
-- Explicit per-role policies mirroring public.submittal_rounds exactly (the
-- closest existing child-of-submittal table): SELECT to anyone with project
-- access; INSERT/UPDATE/DELETE gated to the 'field' role floor. No blanket-true
-- policy. auth.uid() is not referenced directly — the helpers already wrap it.
ALTER TABLE public.submittal_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS submittal_components_select ON public.submittal_components;
CREATE POLICY submittal_components_select ON public.submittal_components
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS submittal_components_insert ON public.submittal_components;
CREATE POLICY submittal_components_insert ON public.submittal_components
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'field'));

DROP POLICY IF EXISTS submittal_components_update ON public.submittal_components;
CREATE POLICY submittal_components_update ON public.submittal_components
  FOR UPDATE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'field'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'field'));

DROP POLICY IF EXISTS submittal_components_delete ON public.submittal_components;
CREATE POLICY submittal_components_delete ON public.submittal_components
  FOR DELETE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'field'));

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Match the table-level grants used across the schema (authenticated +
-- service_role; anon has none — reads still gated by RLS). No grant to anon.
GRANT ALL ON TABLE public.submittal_components TO authenticated;
GRANT ALL ON TABLE public.submittal_components TO service_role;
