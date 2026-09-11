-- Read-only definition snapshot, project kjrwqagyeswwoxpjkcko, 2026-09-11.
-- Pure helpers only; no production records or credentials.
CREATE OR REPLACE FUNCTION public.backcharge_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_from is not distinct from p_to then true
    when p_to = 'void' then p_from in ('draft', 'notice_sent', 'pending', 'disputed')
    when p_from = 'draft' then p_to in ('notice_sent', 'pending')
    when p_from = 'notice_sent' then p_to in ('pending', 'disputed', 'approved', 'rejected')
    when p_from = 'pending' then p_to in ('approved', 'disputed', 'rejected')
    when p_from = 'disputed' then p_to in ('pending', 'approved', 'rejected')
    when p_from = 'approved' then p_to = 'collected'
    else false end;
$function$;

CREATE OR REPLACE FUNCTION public.change_order_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_from is not distinct from p_to then true
    when p_to = 'Void' then p_from <> 'Void'
    when p_from = 'Draft' then p_to in ('Submitted', 'Approved')
    when p_from = 'Submitted' then p_to in ('Under Review', 'Approved', 'Rejected')
    when p_from = 'Under Review' then p_to in ('Approved', 'Rejected')
    when p_from = 'Rejected' then p_to in ('Under Review', 'Submitted')
    else false end;
$function$;

CREATE OR REPLACE FUNCTION public.expense_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_from is not distinct from p_to then true
    when p_to = 'Void' then p_from in ('Pending', 'Submitted', 'Rejected')
    when p_from = 'Pending' then p_to = 'Submitted'
    when p_from = 'Submitted' then p_to in ('Approved', 'Rejected', 'Pending')
    when p_from = 'Approved' then p_to in ('Paid', 'Rejected')
    when p_from = 'Rejected' then p_to = 'Submitted'
    else false end;
$function$;

CREATE OR REPLACE FUNCTION public.pay_application_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_from is not distinct from p_to then true
    when p_to = 'void' then p_from in ('draft', 'submitted', 'approved')
    when p_from = 'draft' then p_to = 'submitted'
    when p_from = 'submitted' then p_to in ('approved', 'draft')
    when p_from = 'approved' then p_to = 'paid'
    else false end;
$function$;

CREATE OR REPLACE FUNCTION public.risk_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_from is not distinct from p_to then true
    when p_from = 'Open' then p_to in ('Mitigating', 'Accepted', 'Transferred', 'Closed')
    when p_from = 'Mitigating' then p_to in ('Mitigated', 'Open', 'Closed')
    when p_from = 'Mitigated' then p_to in ('Closed', 'Open', 'Mitigating')
    when p_from in ('Accepted', 'Transferred') then p_to in ('Open', 'Closed')
    when p_from = 'Closed' then p_to = 'Open'
    else false end;
$function$;

CREATE OR REPLACE FUNCTION public.submittal_bic_class(p_bic text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_bic is null or btrim(p_bic) = '' then 'detailer'
    when p_bic ~* '^closed$' then 'closed'
    when p_bic ~* '\m(eor|engineer|architect|aor|design|lge)\M' then 'approver'
    when p_bic ~* '\m(gc|general contractor|owner|construction manager|cm)\M' then 'downstream'
    else 'detailer' end;
$function$;

CREATE OR REPLACE FUNCTION public.submittal_derived_stage(p_status text, p_bic text, p_approved_date date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_status
    when 'Draft' then 'IFA'
    when 'Submitted' then case when public.submittal_bic_class(p_bic) = 'detailer' then 'IFA' else 'OFA' end
    when 'Under Review' then case when public.submittal_bic_class(p_bic) = 'detailer' then 'IFA' else 'OFA' end
    when 'Approved' then case public.submittal_bic_class(p_bic) when 'downstream' then 'IFC' when 'closed' then 'IFC' when 'approver' then 'BFA' else 'OFS' end
    when 'Approved as Noted' then case public.submittal_bic_class(p_bic)
        when 'downstream' then 'IFC' when 'closed' then 'IFC' when 'approver' then 'BFA'
        else case when p_approved_date is null then 'BFA' else 'OFS' end end
    when 'Revise and Resubmit' then 'R&R'
    when 'Rejected' then 'R&R'
    when 'Released for Fabrication' then 'Released'
    else 'Not Started' end;
$function$;

CREATE OR REPLACE FUNCTION public.submittal_ofs_checklist_complete(p_metadata jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce((p_metadata->'ofs_checklist'->>'markups_incorporated')::boolean, false)
     and coalesce((p_metadata->'ofs_checklist'->>'comments_addressed')::boolean, false)
     and coalesce((p_metadata->'ofs_checklist'->>'sheets_ready')::boolean, false)
     and coalesce((p_metadata->'ofs_checklist'->>'authorized_to_issue')::boolean, false);
$function$;
