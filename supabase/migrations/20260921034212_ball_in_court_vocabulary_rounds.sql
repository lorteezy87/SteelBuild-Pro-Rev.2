-- Constrain `submittal_rounds.ball_in_court` to the same vocabulary as
-- `rfis` and `submittals`.
--
-- 20260920014500 constrained rfis and submittals but left submittal_rounds
-- as unconstrained free text, even though NewRoundModal writes it on every
-- new round and RoundTimeline and submittalAnalytics read it back. Left open,
-- it drifts exactly the way the other two did -- that migration had to null
-- the literal string "Closed" out of 6 rows before it could add its checks.
--
-- Production conforms already, so this validates rather than deferring:
--   NULL 7, EOR 14, Detailer 7, GC 2, Architect 1, Subcontractor 1  (32 rows)
--
-- Mirrored in src/lib/ballInCourt.ts, which is now the only vocabulary. The
-- two must not drift.
--
-- Note the companion change: five separate BIC_CHOICES lists offered "S&H",
-- which was never in this vocabulary. Once 20260920014500 added
-- chk_submittals_ball_in_court, picking it failed the save with a raw
-- constraint name. Those lists now read BALL_IN_COURT_PARTIES, so no picker
-- can offer a value these constraints reject. Zero rows ever stored "S&H" --
-- all three constraints validate clean -- so nothing needed backfilling here.

do $$
begin
  if to_regclass('public.submittal_rounds') is null then
    raise notice 'public.submittal_rounds missing; skipping ball_in_court constraint';
  else
    alter table public.submittal_rounds
      drop constraint if exists chk_submittal_rounds_ball_in_court;
    alter table public.submittal_rounds
      add constraint chk_submittal_rounds_ball_in_court
      check (
        ball_in_court is null
        or ball_in_court = any (array[
          'Contractor','Subcontractor','Detailer','GC','EOR','AOR','Architect','Owner'
        ]::text[])
      )
      not valid;
    alter table public.submittal_rounds
      validate constraint chk_submittal_rounds_ball_in_court;
  end if;
end $$;

notify pgrst, 'reload schema';
