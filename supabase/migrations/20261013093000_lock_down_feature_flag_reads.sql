-- Keep per-user feature-flag override email addresses out of ordinary browser
-- reads. System administrators still manage the source rows, while every
-- authenticated caller receives only their own effective boolean values.

drop policy if exists feature_flags_select on public.feature_flags;
drop policy if exists feature_flags_admin_select on public.feature_flags;

create policy feature_flags_admin_select
  on public.feature_flags
  for select
  to authenticated
  using (public.user_is_system_admin());

create or replace function public.get_my_feature_flags()
returns table(flag_key text, enabled boolean)
language sql
stable
security definer
set search_path to ''
as $$
  with caller as (
    select lower(btrim(u.email)) as email
    from auth.users u
    where u.id = (select auth.uid())
      and u.email is not null
  )
  select
    f.flag_key::text,
    coalesce(
      (
        select case override_entry.value
          when 'true'::jsonb then true
          when 'false'::jsonb then false
        end
        from jsonb_each(
          case
            when jsonb_typeof(f.user_overrides) = 'object' then f.user_overrides
            else '{}'::jsonb
          end
        ) as override_entry(key, value)
        where lower(override_entry.key) = caller.email
          and jsonb_typeof(override_entry.value) = 'boolean'
        order by override_entry.key
        limit 1
      ),
      f.enabled,
      false
    ) as enabled
  from public.feature_flags f
  cross join caller
  order by f.flag_key;
$$;

alter function public.get_my_feature_flags() owner to postgres;
revoke all on function public.get_my_feature_flags() from public, anon, service_role;
grant execute on function public.get_my_feature_flags() to authenticated;
