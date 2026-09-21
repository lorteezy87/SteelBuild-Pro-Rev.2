-- ball_in_court vocabulary -- constrain rfis/submittals BIC to an actual party.
--
-- TRANSCRIBED, NOT AUTHORED. This statement was applied to production
-- kjrwqagyeswwoxpjkcko and stamped as version 20260920014500, but the file was
-- never committed. The body below is copied verbatim from
-- supabase_migrations.schema_migrations.statements for that version, so the
-- repo reproduces exactly what the database already ran. Do not "tidy" it to
-- match house style: its value is that it is byte-faithful to production.
--
-- Until this landed, `supabase:drift` reported it as an unknownMigration,
-- which is a blocking CI gate -- so it blocked the gated production deploy for
-- every branch, not just the one that introduced it.
--
-- Verified against production before transcription: both CHECK constraints
-- exist and are convalidated, and uq_number_sequences_project_record_ci exists
-- alongside the older case-sensitive uq_number_sequences_project_record.
--
-- The statement is replay-safe (the UPDATEs are idempotent, each ADD CONSTRAINT
-- is preceded by DROP CONSTRAINT IF EXISTS, and the index is CREATE ... IF NOT
-- EXISTS), so a fresh `supabase db reset` is safe and it is a no-op against
-- production.
--
-- NOTE for Rev.2 readers: the body's header refers to src/lib/ballInCourt.ts.
-- No such file exists in this repository -- it belongs to the sibling app
-- SteelBuild-Pro-2026, which shares this database. Rev.2's own BIC vocabularies
-- are NOT the ones this constraint enforces; see the PR that landed this file.

-- Constrain `ball_in_court` on rfis and submittals to an actual party.
--
-- Applied to production and stamped by hand because `supabase db push` cannot
-- run against this project: 42 versions in the remote ledger have no local
-- files (41 owned by the sibling app SteelBuild-Pro-2026, per
-- supabase/production-ownership-manifest.json), and the CLI refuses rather
-- than understanding a database shared by two repos. The schema change was
-- applied first; this row records it under the version the repo expects.
--
-- The column was unconstrained free text and had drifted: 6 production rows
-- (4 rfis, 2 submittals) stored the literal string "Closed", which is a status,
-- not a party -- and every one already carried a terminal status and a stamped
-- closed_at, so it duplicated the status column.
--
-- Vocabulary is the union of what production stores and what the code already
-- classifies. "Engineer" is EXCLUDED: only the RFI form offered it, zero rows
-- store it, and APPROVER_CLASS_BIC recognises only EOR/Architect/AOR, so an
-- RFI parked on it was invisible to that logic. "AOR" is INCLUDED despite zero
-- rows because the code already classifies it.
--
-- Mirrored in src/lib/ballInCourt.ts. The two must not drift.

update public.rfis set ball_in_court = null
where ball_in_court = 'Closed' and status in ('Closed', 'Void');

update public.submittals set ball_in_court = null
where ball_in_court = 'Closed' and status in ('Released for Fabrication', 'Approved', 'Void');

alter table public.rfis drop constraint if exists chk_rfis_ball_in_court;
alter table public.rfis add constraint chk_rfis_ball_in_court
  check (ball_in_court is null or ball_in_court = any (array[
    'Contractor','Subcontractor','Detailer','GC','EOR','AOR','Architect','Owner'
  ]::text[])) not valid;
alter table public.rfis validate constraint chk_rfis_ball_in_court;

alter table public.submittals drop constraint if exists chk_submittals_ball_in_court;
alter table public.submittals add constraint chk_submittals_ball_in_court
  check (ball_in_court is null or ball_in_court = any (array[
    'Contractor','Subcontractor','Detailer','GC','EOR','AOR','Architect','Owner'
  ]::text[])) not valid;
alter table public.submittals validate constraint chk_submittals_ball_in_court;

-- uq_number_sequences_project_record is case-SENSITIVE, so 'rfi' could coexist
-- with 'RFI' -- two counters minting official numbers for the same records.
create unique index if not exists uq_number_sequences_project_record_ci
  on public.number_sequences (project_id, upper(record_type));

notify pgrst, 'reload schema';
