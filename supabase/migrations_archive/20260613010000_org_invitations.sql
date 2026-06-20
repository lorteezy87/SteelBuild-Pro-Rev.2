-- Org invitations — invite teammates into a workspace (multi-tenant SaaS P0).
-- A pending invite is keyed by a secret token; the invitee accepts via
-- accept_invitation (SECURITY DEFINER) which adds them to the org with the
-- invited role. Org membership ≠ project access — an admin still adds the new
-- member to specific projects (user_projects stays authoritative for data).

create table if not exists public.organization_invitations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  email      text not null,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  token      uuid not null default gen_random_uuid() unique,
  invited_by uuid references auth.users (id),
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);
create unique index if not exists uq_org_invite_pending
  on public.organization_invitations (org_id, lower(email)) where status = 'pending';
create index if not exists idx_org_invite_org on public.organization_invitations (org_id);

alter table public.organization_invitations enable row level security;

drop policy if exists org_invites_select on public.organization_invitations;
create policy org_invites_select on public.organization_invitations
  for select using (public.user_is_org_member(org_id));
drop policy if exists org_invites_insert on public.organization_invitations;
create policy org_invites_insert on public.organization_invitations
  for insert with check (public.user_org_role_at_least(org_id, 'admin') and invited_by = auth.uid());
drop policy if exists org_invites_update on public.organization_invitations;
create policy org_invites_update on public.organization_invitations
  for update using (public.user_org_role_at_least(org_id, 'admin'))
  with check (public.user_org_role_at_least(org_id, 'admin'));
drop policy if exists org_invites_delete on public.organization_invitations;
create policy org_invites_delete on public.organization_invitations
  for delete using (public.user_org_role_at_least(org_id, 'admin'));

-- Minimal invite details for the accept screen (a logged-in non-member can't
-- read the table via RLS, so this definer fn exposes only what's needed).
create or replace function public.get_invitation(p_token uuid)
returns jsonb language sql stable security definer set search_path = 'public' as $$
  select jsonb_build_object(
    'org_id', i.org_id, 'org_name', o.name, 'role', i.role, 'email', i.email,
    'status', i.status, 'expired', (i.expires_at < now())
  )
  from public.organization_invitations i
  join public.organizations o on o.id = i.org_id
  where i.token = p_token;
$$;

-- Accept: the signed-in user (whose email matches the invite) joins the org.
create or replace function public.accept_invitation(p_token uuid)
returns jsonb language plpgsql security definer set search_path = 'public' as $$
declare v_uid uuid; v_email text; v_inv record; v_result jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid;

  select * into v_inv from public.organization_invitations where token = p_token;
  if v_inv.id is null then raise exception 'Invitation not found' using errcode = 'P0001'; end if;
  if v_inv.status <> 'pending' then raise exception 'This invitation is no longer valid' using errcode = 'P0001'; end if;
  if v_inv.expires_at < now() then raise exception 'This invitation has expired' using errcode = 'P0001'; end if;
  if lower(v_inv.email) <> lower(coalesce(v_email, '')) then
    raise exception 'This invitation was sent to a different email address' using errcode = 'P0001';
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do nothing;

  update public.organization_invitations set status = 'accepted' where id = v_inv.id;

  select jsonb_build_object('org_id', o.id, 'org_name', o.name) into v_result
  from public.organizations o where o.id = v_inv.org_id;
  return v_result;
end;
$$;

notify pgrst, 'reload schema';
