-- Migration 004: Add missing columns that the application code expects
-- but were not present in the original schema.

-- ── cost_codes ───────────────────────────────────────────────────────────────
-- Original schema used: code, budget, actual, committed
-- App code uses:        cost_code_number, budget_amount, actual_cost,
--                       committed_cost, forecast_to_complete, notes, phase

ALTER TABLE public.cost_codes
  ADD COLUMN IF NOT EXISTS cost_code_number  TEXT,
  ADD COLUMN IF NOT EXISTS budget_amount     NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_cost       NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS committed_cost    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_to_complete NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS phase             TEXT DEFAULT 'Materials';

-- Back-fill from old column names where data exists
UPDATE public.cost_codes SET
  cost_code_number  = COALESCE(cost_code_number, code),
  budget_amount     = COALESCE(budget_amount, budget, 0),
  actual_cost       = COALESCE(actual_cost, actual, 0),
  committed_cost    = COALESCE(committed_cost, committed, 0)
WHERE cost_code_number IS NULL OR budget_amount = 0;

-- ── production_notes ─────────────────────────────────────────────────────────
-- Original schema used: date, notes
-- App code uses:        note_date, content, category, is_high_priority,
--                       is_resolved, resolved_date, author

ALTER TABLE public.production_notes
  ADD COLUMN IF NOT EXISTS note_date        DATE,
  ADD COLUMN IF NOT EXISTS content          TEXT,
  ADD COLUMN IF NOT EXISTS category         TEXT DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS is_high_priority BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_resolved      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resolved_date    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS author           TEXT;

-- Back-fill from old column names
UPDATE public.production_notes SET
  note_date = COALESCE(note_date, date),
  content   = COALESCE(content, notes)
WHERE note_date IS NULL;

-- ── number_sequences ─────────────────────────────────────────────────────────
-- Ensure number_sequences table exists (used for auto-numbering RFIs, COs, etc.)
CREATE TABLE IF NOT EXISTS public.number_sequences (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  next_value  INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, record_type)
);
ALTER TABLE public.number_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.number_sequences;
CREATE POLICY "auth_all" ON public.number_sequences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── sov_items ────────────────────────────────────────────────────────────────
-- sov_id was already added in migration 003, but include here as a safety net
ALTER TABLE public.sov_items
  ADD COLUMN IF NOT EXISTS sov_id TEXT;
