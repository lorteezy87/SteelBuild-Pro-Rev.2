-- Migration: 20260517003000_drawing_sets_sh_metadata
-- Purpose: Add S&H-required metadata fields to drawing_sets for operational
--          tracking: EOR reviewer, area/sequence tag, due date, and linked
--          work package IDs.

ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS eor_reviewer TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS area_sequence TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS linked_work_package_ids UUID[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_drawing_sets_due_date ON drawing_sets(due_date) WHERE due_date IS NOT NULL;
