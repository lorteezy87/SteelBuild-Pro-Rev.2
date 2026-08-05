-- Custom approval routing (§20): an ordered chain of ball-in-court parties a
-- submittal walks through (e.g. Detailer → GC → Architect → EOR).
--   approval_chain      jsonb array of step objects [{"party":"GC"}, …]
--   approval_chain_step 0-based index of the step currently holding the ball;
--                       null = no custom routing on this submittal.
-- submittals.status stays the workflow source of truth; the chain only
-- drives WHO is next (ball_in_court) while the package routes for approval.

alter table public.submittals
  add column if not exists approval_chain jsonb,
  add column if not exists approval_chain_step integer;

alter table public.submittals
  drop constraint if exists chk_submittals_approval_chain_step;
alter table public.submittals
  add constraint chk_submittals_approval_chain_step
  check (approval_chain_step is null or approval_chain_step >= 0);

notify pgrst, 'reload schema';
