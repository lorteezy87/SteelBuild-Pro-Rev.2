-- user_profiles was readable by ANY authenticated user (qual=true) -> cross-tenant
-- name/email/role enumeration. Restrict to: your own profile, or a profile of
-- someone who shares an organization with you (so workspace member lists + assignee
-- names still resolve). You can ALWAYS read your own profile, so login is unaffected.

create or replace function public.users_share_org(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.organization_members m1
    join public.organization_members m2 on m2.org_id = m1.org_id
    where m1.user_id = p_a and m2.user_id = p_b
  );
$$;

alter policy profiles_select on public.user_profiles
  using (
    id = (select auth.uid())
    or public.users_share_org((select auth.uid()), id)
  );

notify pgrst, 'reload schema';
