-- 063_project_kickoff_fields.sql
--
-- Project Kickoff Checklist + job_type enum.
--
-- The S&H estimating turnover sheet's "Turnover Checklist" tab is the
-- canonical kickoff workflow — drawing date, LOI, GC contract present,
-- LDs, detailer / joist / deck / engineering firms, and a "kickoff
-- complete" sign-off. Everything below is added nullable so existing
-- projects don't have to be back-filled, and the dashboard can render
-- the section as collapsed-by-default until someone fills in a value.
--
-- The detailer is the only first-class FK because it's referenced
-- often from the drawings UI; the others are free-text per the
-- workbook (joist mfr, deck mfr, deck installer, special coatings,
-- engineering firm). We can normalize them to contacts later if a
-- workflow demands it.
--
-- The job_type enum is a plain CHECK constraint rather than a Postgres
-- ENUM so the values can be added/removed without ALTER TYPE
-- gymnastics. Allowed values come from the Drop Down Options tab on
-- the workbook.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS job_type                 TEXT,
  ADD COLUMN IF NOT EXISTS drawing_date             DATE,
  ADD COLUMN IF NOT EXISTS loi_received_date        DATE,
  ADD COLUMN IF NOT EXISTS gc_contract_present      BOOLEAN,
  ADD COLUMN IF NOT EXISTS liquidated_damages       BOOLEAN,
  ADD COLUMN IF NOT EXISTS detailer_contact_id      UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS joist_manufacturer       TEXT,
  ADD COLUMN IF NOT EXISTS deck_manufacturer        TEXT,
  ADD COLUMN IF NOT EXISTS deck_installer           TEXT,
  ADD COLUMN IF NOT EXISTS special_coatings         TEXT,
  ADD COLUMN IF NOT EXISTS engineering_firm         TEXT,
  ADD COLUMN IF NOT EXISTS kickoff_complete         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS kickoff_completed_at     TIMESTAMPTZ;

-- Job type CHECK — values pulled from the Drop Down Options tab.
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_job_type_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_job_type_check
  CHECK (job_type IS NULL OR job_type IN (
    'Beams/Deck',
    'Beams/Joists/Deck',
    'Joist Deck',
    'Tilt',
    'Tilt Hybrid',
    'Misc.',
    'Other'
  ));

-- Index the detailer FK so the kickoff card can join cheaply.
CREATE INDEX IF NOT EXISTS idx_projects_detailer_contact_id
  ON public.projects(detailer_contact_id)
  WHERE detailer_contact_id IS NOT NULL;
