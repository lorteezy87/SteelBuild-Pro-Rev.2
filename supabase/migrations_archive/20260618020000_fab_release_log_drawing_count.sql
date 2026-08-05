-- Reconcile schema drift: the live fab_release_log table is missing drawing_count,
-- though 20260612131000_fab_release_gate_enforcement.sql declares it and
-- recordFabRelease() (src/lib/fabRelease/releaseStatus.ts) inserts it. The
-- enforcement migration's `create table if not exists` no-op'd because the table
-- already existed in an earlier shape, so the column was never added -- meaning
-- EVERY real recordFabRelease() insert would throw "column drawing_count does not
-- exist". (The table has 0 rows: the gated release path has never successfully
-- run.) Add the column to match the file + client. Applied live 2026-06-18.
alter table public.fab_release_log
  add column if not exists drawing_count integer not null default 0;

notify pgrst, 'reload schema';
