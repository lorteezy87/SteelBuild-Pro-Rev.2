-- Task 4 (2026-07-01 audit): M14 + M1 + M41(guard subset). Audit/attribution hardening.
-- Applied live via Supabase MCP (recorded version 20260702035058); lockstep repo copy.
-- Verified live: activities insert stamps performed_by_user_id from auth.uid() (client
-- performed_by ignored); a signed-in viewer INSERT of user_profiles(role='admin') is
-- rejected with 'user_profiles.role is server-controlled'; trg_audit_log present on the
-- 8 added authority tables. L24 (project-membership audit) is already covered by the
-- existing user_projects_member_activity_log trigger. M21 retention + M2 storage RLS +
-- organization_members audit are deferred to docs/runbooks/owner-checklist.md.

-- M14: bind the activities actor to auth.uid() (performed_by is spoofable free text).
alter table public.activities add column if not exists performed_by_user_id uuid;

create or replace function public.activities_stamp_actor()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.performed_by_user_id := auth.uid();  -- server-controlled; ignore any client-supplied value
  return new;
end; $$;
revoke all on function public.activities_stamp_actor() from public, anon, authenticated;
drop trigger if exists trg_activities_actor on public.activities;
create trigger trg_activities_actor before insert on public.activities
  for each row execute function public.activities_stamp_actor();

-- M1: extend the proven audit_log_trigger() to the moat + financial authority tables
--     (all have project_id + id; the fn no-ops when the parent project is gone).
do $$
declare t text;
  audit_tables text[] := array[
    'submittals','drawings','drawing_sets','drawing_revisions',
    'pay_applications','pay_application_lines','cost_codes','budget_hour_items'];
begin
  foreach t in array audit_tables loop
    execute format('drop trigger if exists trg_audit_log on public.%I', t);
    execute format(
      'create trigger trg_audit_log after insert or update or delete on public.%I '
      || 'for each row execute function public.audit_log_trigger()', t);
  end loop;
end $$;

-- M41 (guard subset): extend the server-controlled-role lock to INSERT so a signed-in
-- user cannot self-insert a user_profiles row with an elevated role (latent escalation
-- in migration-rebuilt envs). SECURITY DEFINER signup (handle_new_user) has auth.uid()
-- NULL and omits role (defaults 'user'), so it is never caught by the auth.uid() gate.
create or replace function public.prevent_user_profile_role_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' and new.role is distinct from 'user' then
      raise exception 'user_profiles.role is server-controlled';
    elsif tg_op = 'UPDATE' and old.role is distinct from new.role then
      raise exception 'user_profiles.role is server-controlled';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists prevent_user_profile_role_change on public.user_profiles;
create trigger prevent_user_profile_role_change
  before insert or update of role on public.user_profiles
  for each row execute function public.prevent_user_profile_role_change();

notify pgrst, 'reload schema';
