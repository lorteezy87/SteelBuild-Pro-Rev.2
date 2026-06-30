-- Guard projects header/financial writes + make org_id immutable for end users.
-- Closes (audit CODE_REVIEW_REV2 Critical): any project member down to 'viewer'
-- could reassign projects.org_id to another org via a plain UPDATE (cross-tenant
-- project hijack) and could edit contract/financial fields, because the projects
-- UPDATE RLS policy is user_has_project_access(id) with no role floor and no
-- org_id guard (its WITH CHECK re-checks access on the pre-update snapshot, so the
-- org_id change passes). Benign columns (metadata, phase, notes, dates, …) stay
-- editable by any project member so getting-started / kickoff flows keep working.
-- Mirrors the existing org_protect_billing_columns() pattern on organizations.
--
-- Applied live to prod (kjrwqagyeswwoxpjkcko) via apply_migration on 2026-06-29;
-- this file records that change for repo↔schema_migrations lockstep.
create or replace function public.enforce_project_update_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Tenant key is immutable for end users. Only the service role / DB owner (i.e.
  -- not 'authenticated') may ever move a project between orgs, and that should be a
  -- dedicated, audited path — never a silent column UPDATE.
  if auth.role() = 'authenticated' and new.org_id is distinct from old.org_id then
    raise exception 'project org_id is immutable' using errcode = '42501';
  end if;

  -- Contract / financial header fields require PM or above. Viewers and field users
  -- cannot edit them; PM/admin/owner can.
  if auth.role() = 'authenticated'
     and not public.user_has_project_role_at_least(old.id, 'pm')
     and (
          new.original_contract_value is distinct from old.original_contract_value
       or new.retainage_percent       is distinct from old.retainage_percent
       or new.contingency_amount      is distinct from old.contingency_amount
       or new.contract_type           is distinct from old.contract_type
       or new.project_number          is distinct from old.project_number
     ) then
    raise exception 'Editing project contract fields requires PM or admin' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_project_update_guard on public.projects;
create trigger trg_enforce_project_update_guard
  before update on public.projects
  for each row execute function public.enforce_project_update_guard();

-- This is a trigger function, not an RPC: keep it off the exposed API surface.
revoke execute on function public.enforce_project_update_guard() from anon, authenticated;
