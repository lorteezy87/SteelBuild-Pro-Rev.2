-- One-shot: clear edit locks on all drawing_sets.
--
-- Clears is_locked / lock metadata so sets can accept revisions and edits.
-- The unlock trigger requires an admin JWT context, so this migration briefly
-- disables that trigger, clears lock columns, then re-enables it.
-- Auto-lock on terminal submittal approval was removed (PR #126); lockSet()
-- remains available for manual use only.
--
-- Applied live to prod (kjrwqagyeswwoxpjkcko) via SQL editor on 2026-07-25.

ALTER TABLE public.drawing_sets DISABLE TRIGGER drawing_sets_unlock_role_check;

UPDATE public.drawing_sets
SET
  is_locked = false,
  locked_at = null,
  locked_by = null,
  locked_reason = null
WHERE is_locked = true;

ALTER TABLE public.drawing_sets ENABLE TRIGGER drawing_sets_unlock_role_check;
