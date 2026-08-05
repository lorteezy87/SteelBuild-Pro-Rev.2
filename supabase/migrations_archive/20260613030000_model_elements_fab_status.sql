-- 20260613030000_model_elements_fab_status.sql
-- Manual fab-status assignment for the Detailing Control Center 3D viewer.
-- (Applied live via Supabase MCP on 2026-06-13, captured here for repo parity.)
--
-- A hand-set, coarse fabrication stage per element (click a piece in the model →
-- assign), independent of the detailing-readiness engine (modelElementStatus /
-- ELEMENT_STATUS_META). Nullable — null = unassigned (renders the part's native
-- IFC color). RLS on model_elements already floors writes at >= field, so the
-- in-app assignment is gated there; no new policy needed.
alter table public.model_elements
  add column if not exists fab_status text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'model_elements_fab_status_check') then
    alter table public.model_elements
      add constraint model_elements_fab_status_check
      check (fab_status is null or fab_status in
        ('not_started','in_fabrication','fabricated','shipped','erected'));
  end if;
end $$;

notify pgrst, 'reload schema';
