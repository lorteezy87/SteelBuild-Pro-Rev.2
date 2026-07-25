-- One-shot: clear edit locks on all drawing_sets.
--
-- Terminal submittal approvals auto-lock linked sets (is_locked). Owner asked
-- to remove those locks. The unlock trigger requires an admin JWT context, so
-- this migration briefly disables that trigger, clears lock columns, then
-- re-enables it. Future approvals can still re-lock via lockSet().

ALTER TABLE public.drawing_sets DISABLE TRIGGER drawing_sets_unlock_role_check;

UPDATE public.drawing_sets
SET
  is_locked = false,
  locked_at = null,
  locked_by = null,
  locked_reason = null
WHERE is_locked = true;

ALTER TABLE public.drawing_sets ENABLE TRIGGER drawing_sets_unlock_role_check;
