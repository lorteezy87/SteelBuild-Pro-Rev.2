-- ── OFS mandatory scrub + transition graph (drawing approval lifecycle, Slice 4)
--
-- Product rules:
--   1. `submittal_approved_to_scrub` defaults ON so BFA "Approved" routes
--      through OFS (Out for Scrub) like "Approved as Noted".
--   2. Approved / Approved as Noted may no longer slide back to
--      "Under Review" (OFS/BFA → OFA resubmittal loop). Scrub ≠
--      resubmittal; returning to approval requires R&R/Rejected or an
--      audited override outside this graph.
--
-- Client mirrors: src/lib/submittalTransitions.ts, src/lib/ofsCompletionGate.ts,
-- src/lib/submittalActionEngine.ts.

-- Flip the scrub flag default ON (preserve per-user overrides).
UPDATE public.feature_flags
SET
  enabled = true,
  description =
    'When on (default since 2026-07-25 Slice 4), a BFA "Approved" submittal routes through the detailer scrub (OFS -> IFC -> Released) like "Approved as Noted", rather than skipping to IFC.'
WHERE flag_key = 'submittal_approved_to_scrub';

INSERT INTO public.feature_flags (flag_key, enabled, user_overrides, description)
VALUES (
  'submittal_approved_to_scrub',
  true,
  '{}'::jsonb,
  'When on (default since 2026-07-25 Slice 4), a BFA "Approved" submittal routes through the detailer scrub (OFS -> IFC -> Released) like "Approved as Noted", rather than skipping to IFC.'
)
ON CONFLICT (flag_key) DO UPDATE
SET
  enabled = true,
  description = EXCLUDED.description;

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

  case v_from
    when 'Draft' then
      v_allowed := array['Submitted', 'Under Review', 'Void'];
    when 'Submitted' then
      v_allowed := array['Under Review', 'Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected', 'Void'];
    when 'Under Review' then
      v_allowed := array['Submitted', 'Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected', 'Void'];
    when 'Approved' then
      -- No 'Under Review': OFS is scrub, not a resubmittal (Slice 4).
      v_allowed := array['Released for Fabrication', 'Revise and Resubmit', 'Void'];
    when 'Approved as Noted' then
      v_allowed := array['Released for Fabrication', 'Revise and Resubmit', 'Void'];
    when 'Revise and Resubmit' then
      v_allowed := array['Submitted', 'Under Review', 'Void'];
    when 'Rejected' then
      v_allowed := array['Draft', 'Submitted', 'Under Review', 'Void'];
    when 'Released for Fabrication' then
      v_allowed := array['Void'];
    when 'Void' then
      v_allowed := array[]::text[];
    else
      return new;
  end case;

  if not (v_to = any (v_allowed)) then
    raise exception
      'SUBMITTAL_TRANSITION_BLOCKED: Cannot move a submittal from "%" to "%". Allowed next statuses: %.',
      v_from,
      v_to,
      case when coalesce(array_length(v_allowed, 1), 0) = 0 then '(terminal)' else array_to_string(v_allowed, ', ') end;
  end if;

  -- R&R → sent requires transmission evidence (Slice 3).
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
