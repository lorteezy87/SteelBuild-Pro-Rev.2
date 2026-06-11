-- Submittal sync identity: rows pushed from the standalone SteelBuild
-- Submittals app (Supabase project bxpowsphvofllljfbvmo) carry the source
-- system + the source row's uuid, so the sync upsert is idempotent
-- (on_conflict external_id) and synced rows are distinguishable from
-- Pro-native ones. Writes arrive via the sync edge function using the
-- service role — RLS policies are unchanged.

alter table public.submittals
  add column if not exists external_source text,
  add column if not exists external_id uuid;

create unique index if not exists uq_submittals_external_id
  on public.submittals (external_id)
  where external_id is not null;

notify pgrst, 'reload schema';
