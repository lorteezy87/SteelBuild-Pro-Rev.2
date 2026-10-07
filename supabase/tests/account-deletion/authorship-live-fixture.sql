-- Read-only staging catalog snapshot 2026-10-07, before authorship guard fix.
-- Three complete live row shapes/defaults/CHECKs/PKs; unrelated FKs omitted.
-- Function bodies match the live original guards, including the failing report
-- immutability and frozen-ticket paths. Tests attach normal triggers after seed.
CREATE TABLE public."backcharges" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "project_id" uuid NOT NULL,
  "backcharge_number" text,
  "title" text NOT NULL,
  "description" text,
  "responsible_party" text,
  "responsible_party_type" text DEFAULT 'subcontractor'::text,
  "reason_code" text DEFAULT 'rework'::text,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "amount" numeric(14,2) DEFAULT 0 NOT NULL,
  "incident_date" date,
  "notice_date" date,
  "linked_co_id" uuid,
  "source_rfi_id" uuid,
  "cost_code_id" uuid,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid DEFAULT auth.uid(),
  "is_deleted" boolean DEFAULT false NOT NULL,
  "deleted_at" timestamp with time zone,
  "ticket_total" numeric DEFAULT 0 NOT NULL,
  "collected_amount" numeric,
  "collected_at" date,
  "approved_at" date,
  "approved_by" text,
  "void_reason" text,
  "decision_notes" text,
  CONSTRAINT "backcharges_pkey" PRIMARY KEY (id),
  CONSTRAINT "backcharges_reason_code_check" CHECK ((reason_code = ANY (ARRAY['rework'::text, 'cleanup'::text, 'delay'::text, 'damage'::text, 'defective_material'::text, 'schedule'::text, 'other'::text]))),
  CONSTRAINT "backcharges_responsible_party_type_check" CHECK ((responsible_party_type = ANY (ARRAY['subcontractor'::text, 'vendor'::text, 'supplier'::text, 'gc'::text, 'other'::text]))),
  CONSTRAINT "backcharges_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'notice_sent'::text, 'pending'::text, 'disputed'::text, 'approved'::text, 'rejected'::text, 'collected'::text, 'void'::text]))),
  CONSTRAINT "chk_backcharges_amount" CHECK ((amount >= (0)::numeric)) NOT VALID
);

CREATE TABLE public."backcharge_tm_tickets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "backcharge_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "ticket_number" text,
  "ticket_date" date,
  "description" text,
  "labor_hours" numeric(10,2) DEFAULT 0 NOT NULL,
  "labor_rate" numeric(10,2) DEFAULT 0 NOT NULL,
  "equipment_cost" numeric(12,2) DEFAULT 0 NOT NULL,
  "material_cost" numeric(12,2) DEFAULT 0 NOT NULL,
  "markup_percent" numeric(6,2) DEFAULT 0 NOT NULL,
  "amount" numeric(14,2) DEFAULT 0 NOT NULL,
  "signed_by" text,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" uuid DEFAULT auth.uid(),
  "is_deleted" boolean DEFAULT false NOT NULL,
  "deleted_at" timestamp with time zone,
  "sort_order" integer,
  CONSTRAINT "backcharge_tm_tickets_pkey" PRIMARY KEY (id),
  CONSTRAINT "chk_backcharge_tm_values" CHECK (((labor_hours >= (0)::numeric) AND (labor_rate >= (0)::numeric) AND (equipment_cost >= (0)::numeric) AND (material_cost >= (0)::numeric) AND (markup_percent >= (0)::numeric))) NOT VALID
);

CREATE TABLE public."drawing_revision_summaries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "drawing_set_id" uuid,
  "set_name" text,
  "sheets_changed" integer DEFAULT 0 NOT NULL,
  "high_risk_count" integer DEFAULT 0 NOT NULL,
  "likely_rfi" boolean DEFAULT false NOT NULL,
  "impact_level" text DEFAULT 'low'::text NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "generated_by" uuid,
  "is_deleted" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "drawing_revision_summaries_impact_level_check" CHECK ((impact_level = ANY (ARRAY['none'::text, 'low'::text, 'medium'::text, 'high'::text]))),
  CONSTRAINT "drawing_revision_summaries_pkey" PRIMARY KEY (id)
);

CREATE OR REPLACE FUNCTION public.enforce_backcharge_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.bc_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'backcharges rows are never hard-deleted; void or soft-delete instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc then raise exception 'Use create_backcharge() — numbers are minted there' using errcode = '42501'; end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.backcharge_number is not null and new.backcharge_number is distinct from old.backcharge_number then raise exception 'backcharge_number is immutable' using errcode = '42501'; end if;
  if not v_rpc then
    if new.status is distinct from old.status or new.notice_date is distinct from old.notice_date or new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by
       or new.collected_at is distinct from old.collected_at or new.collected_amount is distinct from old.collected_amount or new.void_reason is distinct from old.void_reason or new.ticket_total is distinct from old.ticket_total then
      raise exception 'Backcharge status, stamps and ticket total move only through the RPCs' using errcode = '42501';
    end if;
    if new.amount is distinct from old.amount and old.ticket_total > 0 then raise exception 'The amount comes from the T&M tickets while tickets exist' using errcode = '42501'; end if;
    if old.status in ('approved', 'collected') and (new.amount is distinct from old.amount or new.responsible_party is distinct from old.responsible_party or new.linked_co_id is distinct from old.linked_co_id) then
      raise exception 'An approved backcharge is frozen' using errcode = '42501';
    end if;
    if new.is_deleted and not old.is_deleted and old.status not in ('draft', 'void', 'rejected') then raise exception 'Only a draft, void or rejected backcharge can be deleted' using errcode = '42501'; end if;
  elsif new.status is distinct from old.status and not public.backcharge_transition_allowed(old.status, new.status) then
    raise exception 'Backcharge cannot move from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.backcharge_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin new.updated_at = now(); return new; end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_tm_ticket_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text;
begin
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
  select * into v_bc from public.backcharges where id = new.backcharge_id;
  select coalesce(sum(amount), 0) into v_total from public.backcharge_tm_tickets where backcharge_id = new.backcharge_id and is_deleted = false;
  perform set_config('steelbuild.bc_rpc', 'on', true);
  update public.backcharges set ticket_total = round(v_total, 2), amount = case when v_total > 0 then round(v_total, 2) else amount end where id = new.backcharge_id;
  v_kind := case when tg_op = 'INSERT' then 'ticket_added' when new.is_deleted and not old.is_deleted then 'ticket_voided' else 'ticket_updated' end;
  perform public.log_backcharge_event(new.backcharge_id, v_kind, v_bc.status, v_bc.status, format('%s %s → backcharge total %s', new.ticket_number, to_char(new.amount, 'FM999,999,990.00'), to_char(round(v_total, 2), 'FM999,999,990.00')));
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.enforce_revision_summary_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.revcmp_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'drawing_revision_summaries are never hard-deleted' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc and auth.role() = 'authenticated' then raise exception 'Build a report through build_revision_impact_report()' using errcode = '42501'; end if;
    return new;
  end if;
  if to_jsonb(new) - 'is_deleted' - 'deleted_at' is distinct from to_jsonb(old) - 'is_deleted' - 'deleted_at' then raise exception 'A generated report is immutable; generate a new one' using errcode = '42501'; end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$;

