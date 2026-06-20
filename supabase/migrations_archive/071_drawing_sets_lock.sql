-- 071_drawing_sets_lock.sql — Set-level lock for drawing_sets
--
-- Adds is_locked / locked_at / locked_by / locked_reason to drawing_sets so
-- approval (and any future workflow step) can freeze further edits to the
-- zones, links, dependencies, and markup hanging off of any sheet in the
-- set. Service-layer guards (assertSetUnlocked) consult is_locked before
-- every write.
--
-- The lock is set-level (not sheet-level) intentionally: a coordination
-- approval applies to the set as a whole, and zones / links can span
-- sheets, so the natural boundary is the set.

ALTER TABLE public.drawing_sets
  ADD COLUMN IF NOT EXISTS is_locked     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at     timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS locked_reason text;
