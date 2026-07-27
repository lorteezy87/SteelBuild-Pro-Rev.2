-- Drawing / submittal / fab-release control hardening (2026-07-24)
--
-- 1. piece_control_drawing_is_approved: treat "Released for Fabrication" as
--    approved for piece-control release (aligns with package/submittal terminals).
-- 2. submittal fab-release gate: also block superseded + rejected / R&R sheets
--    (parity with enforce_fab_release_gate), not RFIs alone.
-- 3. evaluate_fab_release_package: package-scope preflight for export path so
--    sibling superseded/rejected sheets cannot be bypassed by inserting only
--    approved drawing_ids.
-- 4. enforce_submittal_status_transition: server-side status graph (mirrors
--    src/lib/submittalTransitions.ts).

-- ── 1. Piece-control drawing approval recognizes Released for Fabrication ──
CREATE OR REPLACE FUNCTION "public"."piece_control_drawing_is_approved"(p_drawing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."drawings" AS d
    WHERE d."id" = p_drawing_id
      AND d."is_deleted" = false
      AND d."deleted_at" IS NULL
      AND d."is_superseded" = false
      AND (
        lower(replace(coalesce(d."set_approval_status", ''), ' ', '_'))
          IN ('approved', 'approved_as_noted')
        OR lower(coalesce(d."stage", '')) = 'released'
        OR EXISTS (
          SELECT 1
          FROM "public"."drawing_sets" AS ds
          WHERE ds."id" = d."drawing_set_id"
            AND ds."is_deleted" = false
            AND ds."deleted_at" IS NULL
            AND lower(replace(coalesce(ds."set_approval_status", ''), ' ', '_'))
              IN ('approved', 'approved_as_noted')
        )
        OR EXISTS (
          SELECT 1
          FROM "public"."drawing_signoffs" AS signoff
          WHERE signoff."drawing_id" = d."id"
            AND signoff."is_voided" = false
            AND signoff."stamp_type" IN ('approved_for_fabrication', 'approved_as_noted')
            AND (
              NOT EXISTS (
                SELECT 1 FROM "public"."drawing_revisions" AS current_revision
                WHERE current_revision."drawing_id" = d."id"
                  AND current_revision."is_current" = true
                  AND current_revision."archived_at" IS NULL
              )
              OR EXISTS (
                SELECT 1 FROM "public"."drawing_revisions" AS current_revision
                WHERE current_revision."id" = signoff."drawing_revision_id"
                  AND current_revision."drawing_id" = d."id"
                  AND current_revision."is_current" = true
                  AND current_revision."archived_at" IS NULL
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM "public"."drawing_revisions" AS revision
          WHERE revision."drawing_id" = d."id"
            AND revision."is_current" = true
            AND revision."archived_at" IS NULL
            AND revision."release_status" IS DISTINCT FROM 'superseded'
            AND revision."release_status" IS DISTINCT FROM 'void'
            AND EXISTS (
              SELECT 1 FROM "public"."drawing_reviews" AS review
              WHERE review."drawing_revision_id" = revision."id"
                AND review."decision" IN ('approved', 'approved_with_notes')
            )
            AND NOT EXISTS (
              SELECT 1 FROM "public"."drawing_reviews" AS review
              WHERE review."drawing_revision_id" = revision."id"
                AND review."decision" NOT IN ('approved', 'approved_with_notes', 'not_required')
            )
        )
        OR EXISTS (
          SELECT 1
          FROM "public"."submittals" AS submittal
          WHERE d."drawing_set_id" = ANY(coalesce(submittal."drawing_set_ids", '{}'::uuid[]))
            AND submittal."is_deleted" = false
            AND submittal."deleted_at" IS NULL
            AND submittal."status" IN (
              'Approved',
              'Approved as Noted',
              'Released for Fabrication'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM "public"."submittals" AS submittal
          JOIN "public"."submittal_sheet_responses" AS response
            ON response."submittal_round_id" = submittal."current_round_id"
           AND response."drawing_id" = d."id"
           AND response."is_deleted" = false
           AND response."deleted_at" IS NULL
          WHERE d."drawing_set_id" = ANY(coalesce(submittal."drawing_set_ids", '{}'::uuid[]))
            AND submittal."is_deleted" = false
            AND submittal."deleted_at" IS NULL
            AND response."response_status" IN ('No Exception', 'Approved as Noted')
        )
      )
  );
$$;

-- ── 2. Package-scope fab preflight (used by client before insert) ──────────
CREATE OR REPLACE FUNCTION "public"."evaluate_fab_release_package"(
  p_drawing_ids uuid[]
)
RETURNS TABLE(
  kind text,
  title text,
  sheet_numbers text[],
  rfi_numbers text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rfis text[];
  v_rejected text[];
  v_superseded text[];
  v_unresolved text[];
BEGIN
  -- Open RFIs
  SELECT coalesce(array_agg(DISTINCT b.rfi_number) FILTER (WHERE b.rfi_number IS NOT NULL), '{}')
    INTO v_rfis
  FROM public.fab_release_blocking_rfis(coalesce(p_drawing_ids, '{}')) b;

  IF array_length(v_rfis, 1) IS NOT NULL THEN
    kind := 'open_rfis';
    title := format('%s open RFI(s) reference this package', array_length(v_rfis, 1));
    sheet_numbers := '{}';
    rfi_numbers := v_rfis;
    RETURN NEXT;
  END IF;

  -- Rejected / R&R sheets
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_rejected
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND lower(coalesce(d.stage,'') || ' ' || coalesce(d.set_approval_status,'') || ' ' || coalesce(d.ifc_status,''))
          ~ '(reject|revise|resubmit|returned|r&r)';

  IF array_length(v_rejected, 1) IS NOT NULL THEN
    kind := 'rejected_sheets';
    title := format('%s rejected / revise-and-resubmit sheet(s)', array_length(v_rejected, 1));
    sheet_numbers := v_rejected;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;

  -- Superseded sheets
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_superseded
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND d.is_superseded IS TRUE;

  IF array_length(v_superseded, 1) IS NOT NULL THEN
    kind := 'revision_conflict';
    title := format('%s sheet(s) with a superseded revision', array_length(v_superseded, 1));
    sheet_numbers := v_superseded;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;

  -- Sheets whose current revision is unresolved (no is_current row, or current
  -- revision is on_hold / pending_review / void)
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_unresolved
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND d.is_superseded IS DISTINCT FROM true
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.drawing_revisions r
        WHERE r.drawing_id = d.id
          AND r.is_current = true
          AND r.archived_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.drawing_revisions r
        WHERE r.drawing_id = d.id
          AND r.is_current = true
          AND r.archived_at IS NULL
          AND r.release_status IN ('on_hold', 'void', 'pending_review')
      )
    );

  IF array_length(v_unresolved, 1) IS NOT NULL THEN
    kind := 'unresolved_revision';
    title := format('%s sheet(s) with an unresolved current revision', array_length(v_unresolved, 1));
    sheet_numbers := v_unresolved;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_fab_release_package(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_fab_release_package(uuid[]) TO authenticated, service_role;

-- ── 3. Submittal fab gate: RFIs + rejected + superseded ────────────────────
CREATE OR REPLACE FUNCTION "public"."enforce_submittal_fab_release_gate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_blocking text[];
  v_rejected text[];
  v_superseded text[];
begin
  if new.status is distinct from 'Released for Fabrication'
     or old.status is not distinct from 'Released for Fabrication' then
    return new;
  end if;

  -- Audited override escapes every dimension (matches package export gate).
  if coalesce(btrim(new.fab_release_override_reason), '') <> '' then
    return new;
  end if;

  select coalesce(array_agg(distinct b.rfi_number) filter (where b.rfi_number is not null), '{}')
    into v_blocking
  from public.submittal_blocking_rfis(new.id) b;
  if array_length(v_blocking, 1) is not null then
    raise exception
      'FAB_RELEASE_BLOCKED: % open RFI(s) reference sheets in this submittal''s package (%). Resolve them or release with an override reason.',
      array_length(v_blocking, 1), array_to_string(v_blocking, ', ');
  end if;

  select coalesce(array_agg(d.sheet_number order by d.sheet_number)
                    filter (where d.sheet_number is not null), '{}')
    into v_rejected
  from public.drawings d
  where d.drawing_set_id = any (coalesce(new.drawing_set_ids, '{}'))
    and d.is_deleted is distinct from true
    and lower(coalesce(d.stage,'') || ' ' || coalesce(d.set_approval_status,'') || ' ' || coalesce(d.ifc_status,''))
          ~ '(reject|revise|resubmit|returned|r&r)';
  if array_length(v_rejected, 1) is not null then
    raise exception
      'FAB_RELEASE_BLOCKED: % sheet marks in this submittal''s package came back rejected or revise-and-resubmit. Resolve them or release with an override reason. Sheets: %',
      array_length(v_rejected, 1), array_to_string(v_rejected, ', ');
  end if;

  select coalesce(array_agg(d.sheet_number order by d.sheet_number)
                    filter (where d.sheet_number is not null), '{}')
    into v_superseded
  from public.drawings d
  where d.drawing_set_id = any (coalesce(new.drawing_set_ids, '{}'))
    and d.is_deleted is distinct from true
    and d.is_superseded is true;
  if array_length(v_superseded, 1) is not null then
    raise exception
      'FAB_RELEASE_BLOCKED: % sheet marks in this submittal''s package are superseded by a newer revision. Release the current revision or release with an override reason. Sheets: %',
      array_length(v_superseded, 1), array_to_string(v_superseded, ', ');
  end if;

  return new;
end;
$$;

-- ── 4. Submittal status transition graph (server-side) ─────────────────────
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
      v_allowed := array['Draft', 'Submitted', 'Under Review', 'Void'];
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

  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_enforce_submittal_status_transition ON public.submittals;
CREATE TRIGGER trg_enforce_submittal_status_transition
  BEFORE UPDATE OF status ON public.submittals
  FOR EACH ROW
  WHEN (new.status IS DISTINCT FROM old.status)
  EXECUTE FUNCTION public.enforce_submittal_status_transition();

DROP TRIGGER IF EXISTS trg_enforce_submittal_status_transition_insert ON public.submittals;
-- Inserts may start at Draft (default) or an imported status; only validate
-- non-Draft inserts that skip the graph entry points.
CREATE OR REPLACE FUNCTION "public"."enforce_submittal_status_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status is null or btrim(new.status) = '' then
    new.status := 'Draft';
  end if;
  if new.status not in (
    'Draft', 'Submitted', 'Under Review', 'Approved', 'Approved as Noted',
    'Revise and Resubmit', 'Rejected', 'Released for Fabrication', 'Void'
  ) then
    raise exception 'SUBMITTAL_TRANSITION_BLOCKED: Unknown submittal status "%".', new.status;
  end if;
  -- Creating directly as Released for Fabrication still hits the fab gate trigger.
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_enforce_submittal_status_on_insert ON public.submittals;
CREATE TRIGGER trg_enforce_submittal_status_on_insert
  BEFORE INSERT ON public.submittals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_submittal_status_on_insert();
