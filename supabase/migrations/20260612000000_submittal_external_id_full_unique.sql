-- The partial unique index (where external_id is not null) can't be targeted
-- by PostgREST's on_conflict=external_id (42P10) — the sync function's
-- upserts all failed. A FULL unique index behaves identically for our data
-- (NULLs are distinct, so Pro-native rows with NULL external_id are fine)
-- and PostgREST can infer it.
drop index if exists uq_submittals_external_id;
create unique index uq_submittals_external_id
  on public.submittals (external_id);

notify pgrst, 'reload schema';
