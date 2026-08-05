-- Close the submittal fab-release gate's INSERT path: enforce_submittal_fab_release_gate
-- only fired BEFORE UPDATE (when status changed), so a submittal INSERTed directly at
-- status='Released for Fabrication' skipped the open-RFI gate entirely. Add a BEFORE
-- INSERT trigger running the same gate function. The function early-returns unless
-- new.status='Released for Fabrication' AND old wasn't already released; on INSERT
-- OLD is NULL so "old.status is not distinct from 'Released'" is false and it proceeds
-- to the gate check. The WHEN clause references only NEW (legal on INSERT triggers).
--
-- Applied live to prod (kjrwqagyeswwoxpjkcko) via apply_migration on 2026-06-30.
drop trigger if exists trg_enforce_submittal_fab_release_gate_insert on public.submittals;
create trigger trg_enforce_submittal_fab_release_gate_insert
  before insert on public.submittals
  for each row when (new.status = 'Released for Fabrication')
  execute function public.enforce_submittal_fab_release_gate();
