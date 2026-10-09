-- Forward fix for FK-driven account authorship cleanup. The immutable report
-- and frozen-ticket guards must retain business data when Auth deletes a user.
-- No trigger is disabled and no caller-supplied setting enables this exception.
-- Before guards require a nested trigger call, nonnull -> null author, absent
-- Auth parent, and identical remaining semantic fields. The queued AFTER
-- trigger skips only its side effects for that same absent-parent transition;
-- its depth is no longer nested. Direct edits still follow the existing guards.
-- updated_at is ignored only for ticket triggers,
-- because trg_bc_tm_updated_at runs between the guard and amount computation.
-- Apply and stamp in one explicit transaction. The release payload and hosted
-- rollback regression supply that transaction (like the prior erasure files).

CREATE OR REPLACE FUNCTION public.enforce_revision_summary_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.revcmp_rpc', true), '') = 'on';
begin

  -- Auth's ON DELETE SET NULL invokes this as a nested row trigger. Do not
  -- mistake attribution cleanup for an editable report or financial change.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and old.generated_by is not null and new.generated_by is null
     and (to_jsonb(new) - 'generated_by') = (to_jsonb(old) - 'generated_by')
     and not exists (select 1 from auth.users where id = old.generated_by) then
    return new;
  end if;
  if tg_op = 'DELETE' then raise exception 'drawing_revision_summaries are never hard-deleted' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc and auth.role() = 'authenticated' then raise exception 'Build a report through build_revision_impact_report()' using errcode = '42501'; end if;
    return new;
  end if;
  if to_jsonb(new) - 'is_deleted' - 'deleted_at' is distinct from to_jsonb(old) - 'is_deleted' - 'deleted_at' then raise exception 'A generated report is immutable; generate a new one' using errcode = '42501'; end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.enforce_tm_ticket_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text;
begin

  -- Auth's ON DELETE SET NULL invokes this as a nested row trigger. Do not
  -- mistake attribution cleanup for an editable report or financial change.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and old.created_by is not null and new.created_by is null
     and (to_jsonb(new) - 'created_by' - 'updated_at') = (to_jsonb(old) - 'created_by' - 'updated_at')
     and not exists (select 1 from auth.users where id = old.created_by) then
    return new;
  end if;
  if tg_op = 'DELETE' then raise exception 'backcharge_tm_tickets rows are never hard-deleted; set is_deleted instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' and coalesce(current_setting('steelbuild.bc_rpc', true), '') <> 'on' then raise exception 'Use add_tm_ticket() — ticket numbers are minted there' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and (new.backcharge_id is distinct from old.backcharge_id or new.project_id is distinct from old.project_id or new.ticket_number is distinct from old.ticket_number) then raise exception 'ticket ownership / number is immutable' using errcode = '42501'; end if;
  select status into v_status from public.backcharges where id = new.backcharge_id;
  if v_status in ('approved', 'collected', 'void', 'rejected') then raise exception 'Backcharge is % — its tickets are frozen', v_status using errcode = '42501'; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.compute_tm_ticket_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin

  -- Auth's ON DELETE SET NULL invokes this as a nested row trigger. Do not
  -- mistake attribution cleanup for an editable report or financial change.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and old.created_by is not null and new.created_by is null
     and (to_jsonb(new) - 'created_by' - 'updated_at') = (to_jsonb(old) - 'created_by' - 'updated_at')
     and not exists (select 1 from auth.users where id = old.created_by) then
    return new;
  end if;
  new.amount := round((coalesce(new.labor_hours, 0) * coalesce(new.labor_rate, 0) + coalesce(new.equipment_cost, 0) + coalesce(new.material_cost, 0)) * (1 + coalesce(new.markup_percent, 0) / 100), 2);
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  if tg_op = 'UPDATE' and new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.roll_tm_tickets_into_backcharge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_total numeric; v_bc public.backcharges%rowtype; v_kind text;
begin

  -- AFTER events are queued beyond the nested FK trigger's depth. BEFORE
  -- guards already validated this update; avoid fictional financial activity.
  if tg_op = 'UPDATE'
     and old.created_by is not null and new.created_by is null
     and (to_jsonb(new) - 'created_by' - 'updated_at') = (to_jsonb(old) - 'created_by' - 'updated_at')
     and not exists (select 1 from auth.users where id = old.created_by) then
    return null;
  end if;
  select * into v_bc from public.backcharges where id = new.backcharge_id;
  select coalesce(sum(amount), 0) into v_total from public.backcharge_tm_tickets where backcharge_id = new.backcharge_id and is_deleted = false;
  perform set_config('steelbuild.bc_rpc', 'on', true);
  update public.backcharges set ticket_total = round(v_total, 2), amount = case when v_total > 0 then round(v_total, 2) else amount end where id = new.backcharge_id;
  v_kind := case when tg_op = 'INSERT' then 'ticket_added' when new.is_deleted and not old.is_deleted then 'ticket_voided' else 'ticket_updated' end;
  perform public.log_backcharge_event(new.backcharge_id, v_kind, v_bc.status, v_bc.status, format('%s %s → backcharge total %s', new.ticket_number, to_char(new.amount, 'FM999,999,990.00'), to_char(round(v_total, 2), 'FM999,999,990.00')));
  return null;
end $function$;
