-- Server-side gate: block creating an org invitation when the workspace is
-- already at its plan's member limit. Mirrors the accept_invitation member-limit
-- check (20260616010000_plan_limit_enforcement) on the CREATE side, so a free/pro
-- org can't mint pending invites that could never be accepted. Fails OPEN for
-- unlimited plans (business/enterprise → plan_member_limit returns NULL).
--
-- Counts current members + pending invites; the BEFORE INSERT fires before NEW
-- is added, so "used >= limit" blocks once the seats (incl. the owner and any
-- outstanding pending invites) are full. Applied live 2026-06-18.
create or replace function public.enforce_org_invite_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  text;
  v_limit int;
  v_used  int;
begin
  select plan into v_plan from public.organizations where id = NEW.org_id;
  v_limit := public.plan_member_limit(v_plan);
  if v_limit is null then
    return NEW;  -- unlimited plan
  end if;
  select
    (select count(*) from public.organization_members m where m.org_id = NEW.org_id)
    + (select count(*) from public.organization_invitations i
         where i.org_id = NEW.org_id and i.status = 'pending')
    into v_used;
  if v_used >= v_limit then
    raise exception 'Workspace is at its plan member limit (%). Upgrade your plan to invite more teammates.', v_limit
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_org_invite_limit on public.organization_invitations;
create trigger trg_enforce_org_invite_limit
  before insert on public.organization_invitations
  for each row execute function public.enforce_org_invite_limit();
