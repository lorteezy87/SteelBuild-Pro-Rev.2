-- Fourth defect in the organization-erasure chain: 23503 'delivery not found'.
--
-- With the arity (20260912034015), ARCHIVE_FIRST (20260912034015) and cursor
-- lifetime (20260912042823) fixes in place, reset_org_data got as far as actually
-- erasing a project and then aborted on:
--
--   23503: delivery not found
--
-- Cause. hard_delete_project suppresses application triggers for the duration of
-- the erasure by calling erasure_toggle_user_triggers over
--   v_tables := array(select jsonb_object_keys(project_row_counts(p_project_id)))
--               || array['projects'];
-- and project_row_counts enumerates only tables that HAVE a project_id column
-- (and only those with rows for that project). public.delivery_items has no
-- project_id -- it hangs off deliveries -- so it is never in that list and
-- trg_enforce_delivery_item_guards is never disabled.
--
-- The erasure deletes public.deliveries; delivery_items.delivery_id is
-- ON DELETE CASCADE, so the cascade fires the guard AFTER the parent row is
-- already gone. The guard's first act is
--   select * into v_delivery from public.deliveries where id = ...;
--   if v_delivery.id is null then raise exception 'delivery not found' ...
-- which can no longer succeed. Every check after that lookup is meaningless on a
-- cascade DELETE anyway: a frozen-status check, a piece-project check and a
-- qty check, none of which mean anything for a row being erased.
--
-- Fix. Honour steelbuild.erasure_rpc, the flag hard_delete_project and
-- hard_delete_organization already set with set_config(..., is_local => true),
-- and which eight other functions in this database already consult. When it is
-- on, return early. The guard is otherwise byte-for-byte unchanged, so ordinary
-- traffic -- where the flag is unset -- behaves exactly as before, including the
-- 'delivery not found' raise that legitimately catches an orphaned item.
--
-- Why an early return rather than reordering the DELETE branch above the lookup:
-- an early return also covers the INSERT/UPDATE arms, which the erasure does not
-- use today but which hard_delete_organization's future paths might, and it
-- matches the shape of the other erasure-aware guards.
--
-- Scope check, run against the live catalog before writing this. Every table
-- reachable by ON DELETE CASCADE/SET NULL/SET DEFAULT from the erasure's table
-- set was walked to depth 8. Exactly one such table lacks a project_id column
-- AND carries an enabled DELETE-firing trigger that can raise: delivery_items.
-- The two nullable-project_id cascade children whose guards could slip the
-- count > 0 test (drawing_revision_comparisons, drawing_revision_deltas) hold
-- zero NULL-project_id rows. So this is the last trigger-coverage hole, not
-- merely the next one.
--
-- CREATE OR REPLACE, never DROP + CREATE: a drop would detach the trigger.
--
-- Already applied to kjrwqagyeswwoxpjkcko directly on 2026-09-12 so the owner was
-- not blocked; this file brings the repo back in step. It is idempotent.

CREATE OR REPLACE FUNCTION public.enforce_delivery_item_guards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_rpc     boolean := coalesce(current_setting('steelbuild.delivery_rpc', true), '') = 'on';
  v_erasing boolean := coalesce(current_setting('steelbuild.erasure_rpc',  true), '') = 'on';
  v_delivery public.deliveries%rowtype;
  v_piece_project uuid;
begin
  -- The audited erasure RPCs (hard_delete_project / _organization) delete the
  -- parent delivery and let the FK cascade remove its items. By the time this
  -- fires the parent row is already gone, so the lookup below cannot succeed and
  -- every check after it is meaningless. delivery_items has no project_id, so it
  -- is not in project_row_counts and erasure_toggle_user_triggers never disabled
  -- this trigger. Same steelbuild.erasure_rpc convention the other guards use.
  if v_erasing then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select * into v_delivery from public.deliveries where id = coalesce(new.delivery_id, old.delivery_id);
  if v_delivery.id is null then raise exception 'delivery not found' using errcode = '23503'; end if;
  if v_delivery.status in ('Delivered', 'Received', 'Cancelled') and not v_rpc then
    raise exception 'Items are frozen once the delivery is received or cancelled' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.piece_id is not null then
    select project_id into v_piece_project from public.pieces where id = new.piece_id and is_deleted = false;
    if v_piece_project is null or v_piece_project <> v_delivery.project_id then raise exception 'piece must be a live lot of the delivery''s project' using errcode = '23503'; end if;
  end if;
  if coalesce(new.qty, 0) < 1 then raise exception 'qty must be at least 1' using errcode = '23514'; end if;
  return new;
end $function$;

-- NOT APPLIED -- adjacent, deliberately out of scope.
--
-- 1. The structural fix would be for erasure_toggle_user_triggers to walk the FK
--    cascade closure rather than trusting project_row_counts' project_id-column
--    heuristic. That changes the blast radius of every erasure and belongs in its
--    own change, with the owner's sign-off. The scope check above is what makes
--    the narrow fix defensible today: the closure and the heuristic differ by
--    exactly one table.
--
-- 2. delivery_items still has no project_id column. Adding one would fold it into
--    project_row_counts and make this guard's erasure branch redundant, but it is
--    a schema change to a table both repos write to while schema ownership is
--    undecided (CLAUDE.md, "Sibling app").
