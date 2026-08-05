-- 20260528051910_project_on_hold.sql
-- Add "on hold" state to projects. A project can be paused (on_hold=true),
-- which hides it from every UI/aggregate EXCEPT the /Projects management page
-- (the switcher, portfolio, dashboards, and KPI rollups all filter it out).
-- on_hold is orthogonal to phase (lifecycle stage) and health_status (RAG).
-- Applied live via Supabase MCP.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS on_hold        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS on_hold_at     timestamptz,
  ADD COLUMN IF NOT EXISTS on_hold_reason text,
  ADD COLUMN IF NOT EXISTS on_hold_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.on_hold        IS 'Project paused; hidden from switcher/portfolio/KPIs, visible only on /Projects.';
COMMENT ON COLUMN public.projects.on_hold_at     IS 'Timestamp when on_hold was last set to true.';
COMMENT ON COLUMN public.projects.on_hold_reason IS 'Free-text reason for the hold (optional).';
COMMENT ON COLUMN public.projects.on_hold_by     IS 'User who set on_hold=true (FK to auth.users; SET NULL on user delete).';

-- Partial index for the rare "list on-hold projects" path (the /Projects page).
-- on_hold=false is the whole-table majority; not worth indexing.
CREATE INDEX IF NOT EXISTS idx_projects_on_hold
  ON public.projects (on_hold)
  WHERE on_hold = true;

-- Auto-stamp on_hold_at + on_hold_by when on_hold flips, clear them on resume.
-- SECURITY INVOKER so auth.uid() reflects the calling user (RLS still applies).
CREATE OR REPLACE FUNCTION public.project_on_hold_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.on_hold IS DISTINCT FROM OLD.on_hold THEN
    IF NEW.on_hold THEN
      NEW.on_hold_at := COALESCE(NEW.on_hold_at, now());
      NEW.on_hold_by := COALESCE(NEW.on_hold_by, auth.uid());
    ELSE
      NEW.on_hold_at     := NULL;
      NEW.on_hold_by     := NULL;
      NEW.on_hold_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_project_on_hold_stamp ON public.projects;
CREATE TRIGGER trg_project_on_hold_stamp
  BEFORE UPDATE OF on_hold ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.project_on_hold_stamp();

NOTIFY pgrst, 'reload schema';
