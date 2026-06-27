-- Migration 005: Add category column to action_items
-- The Constraints page filters by category = 'CONSTRAINT' to distinguish
-- constraint-type action items from regular ones.

ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'GENERAL';

-- Index for the common filter pattern
CREATE INDEX IF NOT EXISTS idx_action_items_category
  ON public.action_items (project_id, category);

NOTIFY pgrst, 'reload schema';
