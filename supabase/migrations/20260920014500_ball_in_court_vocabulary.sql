-- Constrain `ball_in_court` on rfis and submittals to an actual party.
--
-- The column was unconstrained free text and had drifted: 6 production rows
-- (4 rfis, 2 submittals) stored the literal string "Closed", which is a status,
-- not a party. Every one of those rows already carried a terminal status
-- (Closed / Released for Fabrication) and a stamped closed_at, so the string
-- was pure duplication of the status column -- and it meant any "who owes us
-- this?" query had to special-case a value that is not a person.
--
-- Vocabulary is the union of what production actually stores and what the code
-- already classifies, NOT the RFI form's dropdown:
--   stored:        Contractor(24) EOR(12) Detailer(9) GC(5) Architect(2) Subcontractor(2)
--   approver class: EOR, Architect, AOR   (submittalReviewEngine, submittalStageMapping)
--   approval chains: Detailer, GC, Architect, EOR
-- "Engineer" is deliberately EXCLUDED. Only the RFI form offered it, zero rows
-- store it, and it is a synonym for EOR that the approver-class sets do not
-- recognise -- an RFI parked on it was invisible to that logic.
-- "AOR" is deliberately INCLUDED despite zero rows: it is already in the
-- approver class in code, so excluding it would make an existing path fail.
--
-- Mirrored in src/lib/ballInCourt.ts. The two must not drift.

-- 1. Retire the "Closed" sentinel. NULL is the honest value: nobody holds the
--    ball. Scoped to terminal rows only -- if a row were somehow open with
--    ball_in_court='Closed', nulling it would hide a live ball, so it is left
--    to fail validation below and be looked at by hand.
update public.rfis
set ball_in_court = null
where ball_in_court = 'Closed'
  and status in ('Closed', 'Void');

update public.submittals
set ball_in_court = null
where ball_in_court = 'Closed'
  and status in ('Released for Fabrication', 'Approved', 'Void');

-- 2. Constrain. NULL stays legal on purpose (closed, or never routed).
--    `not valid` then `validate` matches 20260913090000_drawing_transmittal_targets.
do $$
begin
  if to_regclass('public.rfis') is null then
    raise notice 'public.rfis missing; skipping ball_in_court constraint';
  else
    alter table public.rfis drop constraint if exists chk_rfis_ball_in_court;
    alter table public.rfis
      add constraint chk_rfis_ball_in_court
      check (
        ball_in_court is null
        or ball_in_court = any (array[
          'Contractor','Subcontractor','Detailer','GC','EOR','AOR','Architect','Owner'
        ]::text[])
      )
      not valid;
    alter table public.rfis validate constraint chk_rfis_ball_in_court;
  end if;
end $$;

do $$
begin
  if to_regclass('public.submittals') is null then
    raise notice 'public.submittals missing; skipping ball_in_court constraint';
  else
    alter table public.submittals drop constraint if exists chk_submittals_ball_in_court;
    alter table public.submittals
      add constraint chk_submittals_ball_in_court
      check (
        ball_in_court is null
        or ball_in_court = any (array[
          'Contractor','Subcontractor','Detailer','GC','EOR','AOR','Architect','Owner'
        ]::text[])
      )
      not valid;
    alter table public.submittals validate constraint chk_submittals_ball_in_court;
  end if;
end $$;

-- 3. Make a second counter for the same records impossible.
--
--    `uq_number_sequences_project_record` is UNIQUE (project_id, record_type)
--    and case-SENSITIVE, so 'RFI' and 'rfi' can coexist on one project -- two
--    independent counters minting numbers for the same records, which is the
--    duplicate-number failure the RPC exists to prevent. Production already
--    mixes casing across types (RFI, CO, SOV, EXPENSE are upper; submittal,
--    transmittal, action_item are lower), so this is a live hazard, not a
--    hypothetical.
--
--    Verified before adding: zero projects currently have two rows that differ
--    only by case, so the index builds without a conflict.
do $$
begin
  if to_regclass('public.number_sequences') is null then
    raise notice 'public.number_sequences missing; skipping case-fold guard';
  else
    create unique index if not exists uq_number_sequences_project_record_ci
      on public.number_sequences (project_id, upper(record_type));
  end if;
end $$;

comment on index public.uq_number_sequences_project_record_ci is
  'One counter per record type per project regardless of casing. Without this, "rfi" alongside "RFI" mints duplicate official numbers.';

comment on constraint chk_rfis_ball_in_court on public.rfis is
  'Parties only. NULL = nobody holds it (closed, or not routed). Mirrored in src/lib/ballInCourt.ts.';

comment on constraint chk_submittals_ball_in_court on public.submittals is
  'Parties only. NULL = nobody holds it (closed, or not routed). Mirrored in src/lib/ballInCourt.ts.';

notify pgrst, 'reload schema';
