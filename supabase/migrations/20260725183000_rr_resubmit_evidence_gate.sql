-- ── R&R resubmission-evidence gate (drawing approval lifecycle, Slice 3) ────
--
-- Product rule: a submittal returned "Revise and Resubmit" / "Rejected" stays
-- in the R&R stage until the revised set is ACTUALLY retransmitted. Two
-- server-side changes to enforce_submittal_status_transition (client mirror:
-- src/lib/submittalTransitions.ts + src/lib/rrResubmitGate.ts):
--
--   1. "Revise and Resubmit" may no longer slide back to "Draft" — that hid a
--      failed approval cycle as fresh internal prep. (Rejected keeps the
--      Draft edge as its reopen path, pending a formal reopen workflow.)
--   2. Leaving R&R/Rejected via a SENT status (Submitted / Under Review)
--      requires transmission evidence: a submitted_date and a ball_in_court
--      recipient on the same row. The revision-advance check lives client
--      side (the DB cannot see the proposed cycle revision at this point).
--
-- The trigger definitions themselves are unchanged (BEFORE UPDATE OF status).

CREATE OR REPLACE FUNCTION "public"."enforce_submittal_status_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_from text;
  v_to text;
  v_allowed text[];
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_from := coalesce(nullif(btrim(old.status), ''), 'Draft');
  v_to := btrim(new.status);

  if v_to is null or v_to = '' then
    raise exception 'SUBMITTAL_TRANSITION_BLOCKED: A target submittal status is required.';
  end if;

  -- Known targets only (CHECK constraint is the hard enum; this adds the graph).
  case v_from
    when 'Draft' then
      v_allowed := array['Submitted', 'Under Review', 'Void'];
    when 'Submitted' then
      v_allowed := array['Under Review', 'Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected', 'Void'];
    when 'Under Review' then
      v_allowed := array['Submitted', 'Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected', 'Void'];
    when 'Approved' then
      v_allowed := array['Released for Fabrication', 'Revise and Resubmit', 'Under Review', 'Void'];
    when 'Approved as Noted' then
      v_allowed := array['Released for Fabrication', 'Revise and Resubmit', 'Under Review', 'Void'];
    when 'Revise and Resubmit' then
      -- No 'Draft': R&R stays visible until an actual resubmission or void.
      v_allowed := array['Submitted', 'Under Review', 'Void'];
    when 'Rejected' then
      v_allowed := array['Draft', 'Submitted', 'Under Review', 'Void'];
    when 'Released for Fabrication' then
      v_allowed := array['Void'];
    when 'Void' then
      v_allowed := array[]::text[];
    else
      -- Legacy/unknown source: allow recovery into a known enum status.
      return new;
  end case;

  if not (v_to = any (v_allowed)) then
    raise exception
      'SUBMITTAL_TRANSITION_BLOCKED: Cannot move a submittal from "%" to "%". Allowed next statuses: %.',
      v_from,
      v_to,
      case when coalesce(array_length(v_allowed, 1), 0) = 0 then '(terminal)' else array_to_string(v_allowed, ', ') end;
  end if;

  -- R&R → sent requires transmission evidence on the same row. The
  -- submission date must be a NEW transmission: null is blocked, and so is
  -- a date strictly BEFORE the prior cycle's return (a stale date from the
  -- failed cycle). Same-day return + resubmit remains allowed.
  if v_from in ('Revise and Resubmit', 'Rejected')
     and v_to in ('Submitted', 'Under Review') then
    if new.submitted_date is null
       or (old.returned_date is not null and new.submitted_date < old.returned_date) then
      raise exception
        'RR_RESUBMIT_BLOCKED: This package is in R&R — it moves back out for approval only when the revised set is actually transmitted. Record the actual (new) submission date.';
    end if;
    if coalesce(btrim(new.ball_in_court), '') = '' then
      raise exception
        'RR_RESUBMIT_BLOCKED: This package is in R&R — record the recipient (ball-in-court) receiving the resubmittal.';
    end if;
  end if;

  return new;
end;
$$;
