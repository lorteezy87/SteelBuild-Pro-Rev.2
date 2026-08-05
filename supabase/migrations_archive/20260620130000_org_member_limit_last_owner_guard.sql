-- 20260620130000_org_member_limit_last_owner_guard.sql
-- Companion to 20260620000000_org_members_owner_role_guard (the RLS owner ceiling).
-- That migration deferred two integrity gaps on organization_members:
--   1. the DIRECT-insert path bypasses the plan member-limit (only accept_invitation
--      checks it), so an admin can add members past the org's plan limit; and
--   2. nothing stops the LAST owner from being demoted (the RLS USING clause lets an
--      owner update their own row owner->admin), which would orphan the workspace.
-- A BEFORE INSERT/UPDATE trigger closes both. SECURITY DEFINER + empty search_path
-- (everything schema-qualified) mirrors enforce_org_invite_limit. The owner ceiling
-- and "only an owner can touch an owner row" stay in RLS; this only adds the
-- count-based checks RLS can't express.
--
-- Applied live via Supabase MCP (apply_migration) 2026-06-20 and field-verified
-- with a rolled-back DO-block: over-limit direct insert blocked, last-owner
-- demotion blocked, and first-owner / accept-style / promote / non-last-demote pass.

create or replace function public.enforce_org_member_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan         text;
  v_limit        int;
  v_count        int;
  v_other_owners int;
begin
  if tg_op = 'INSERT' then
    -- Plan member-limit, only for a genuinely NEW member (skip re-accept /
    -- ON CONFLICT no-ops). Mirrors accept_invitation's own check exactly, so it
    -- can't false-block that path; it closes the direct-insert bypass. The
    -- first owner from create_organization passes (count 0 < limit).
    if not exists (
      select 1 from public.organization_members m
      where m.org_id = NEW.org_id and m.user_id = NEW.user_id
    ) then
      select plan into v_plan from public.organizations where id = NEW.org_id;
      v_limit := public.plan_member_limit(v_plan);
      if v_limit is not null then
        select count(*) into v_count
          from public.organization_members m where m.org_id = NEW.org_id;
        if v_count >= v_limit then
          raise exception 'Workspace is at its plan member limit (%). Upgrade to add more members.', v_limit
            using errcode = 'P0001';
        end if;
      end if;
    end if;
    return NEW;

  elsif tg_op = 'UPDATE' then
    -- Never let the workspace lose its last owner via demotion. (RLS already
    -- ensures only an owner can update an owner's row, so this just guards the
    -- self-demotion / sole-owner case.)
    if OLD.role = 'owner' and NEW.role <> 'owner' then
      select count(*) into v_other_owners
        from public.organization_members m
        where m.org_id = OLD.org_id and m.role = 'owner' and m.user_id <> OLD.user_id;
      if v_other_owners = 0 then
        raise exception 'Cannot remove the last owner of the workspace' using errcode = 'P0001';
      end if;
    end if;
    return NEW;
  end if;
  return NEW;
end;
$$;

revoke all on function public.enforce_org_member_guard() from public;

drop trigger if exists trg_enforce_org_member_guard on public.organization_members;
create trigger trg_enforce_org_member_guard
  before insert or update on public.organization_members
  for each row execute function public.enforce_org_member_guard();
