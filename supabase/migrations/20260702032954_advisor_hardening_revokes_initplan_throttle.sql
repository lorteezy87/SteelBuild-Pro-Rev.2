-- Enterprise-readiness advisor hardening (2026-07-01): M3, L1, L22, L3.
-- Applied live via Supabase MCP (recorded version 20260702032954); this file is
-- the lockstep repo copy. Revoke public/anon EXECUTE on trigger-only + non-public
-- SECURITY DEFINER functions the advisor flags, stop auto-granting anon EXECUTE on
-- future functions, initplan-wrap the demo-request admin policy, and rate-limit
-- anonymous demo-request inserts.
--
-- NOTE (L4): pg_net cannot be relocated out of `public` on this version
-- (`extension pg_net does not support SET SCHEMA`) — left in public, accepted as
-- low-severity advisor noise (see docs/runbooks/owner-checklist.md).

-- M3: stop auto-granting anon EXECUTE on every future public function + ALL on sequences
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- M3/L1: trigger-only functions never need caller EXECUTE (triggers fire regardless of grant)
revoke all on function public.enforce_org_member_guard()      from public, anon, authenticated;
revoke all on function public.enforce_project_update_guard()  from public, anon, authenticated;
revoke all on function public.notify_demo_request()           from public, anon, authenticated;
revoke all on function public.prevent_schedule_task_cycle()   from public, anon, authenticated;

-- L1: get_invitation is only called post-login (OrgOnboarding) — drop anon/public, keep authenticated
revoke all on function public.get_invitation(uuid) from public, anon;
grant execute on function public.get_invitation(uuid) to authenticated;

-- L22: initplan-wrap auth.uid() in the demo_requests admin-select policy
drop policy if exists "demo_requests admin select" on public.demo_requests;
create policy "demo_requests admin select" on public.demo_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = (select auth.uid()) and up.role = 'admin'
    )
  );

-- L3: cheap global rate-limit on anonymous demo-request inserts (<=20 / 15 min)
create or replace function public.demo_requests_throttle()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if (select count(*) from public.demo_requests
      where created_at > now() - interval '15 minutes') >= 20 then
    raise exception 'demo request rate limit exceeded' using errcode = 'P0001';
  end if;
  return new;
end; $$;
revoke all on function public.demo_requests_throttle() from public, anon, authenticated;
drop trigger if exists demo_requests_throttle on public.demo_requests;
create trigger demo_requests_throttle before insert on public.demo_requests
  for each row execute function public.demo_requests_throttle();

notify pgrst, 'reload schema';
