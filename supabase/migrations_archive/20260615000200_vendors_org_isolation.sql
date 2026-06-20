-- vendors is an org-wide catalog (subs/suppliers) with no project link. Its SELECT
-- policy was `true` -> every authenticated user, across every tenant, could read all
-- vendors. Scope it to the owning org.

alter table public.vendors add column if not exists org_id uuid references public.organizations(id);

-- Backfill the existing rows to the sole org.
update public.vendors
set org_id = (select id from public.organizations order by created_at limit 1)
where org_id is null;

-- Stamp the caller's org on insert so the app (direct insert via entities.Vendor)
-- needs no change, and a vendor can only ever land in the creator's own org. auth.uid()
-- still resolves to the real caller inside a SECURITY DEFINER function.
create or replace function public.vendors_set_org() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.org_id is null then
    new.org_id := (select org_id from public.organization_members
                   where user_id = auth.uid() order by created_at limit 1);
  elsif not public.user_is_org_member(new.org_id) then
    raise exception 'Not a member of the target organization' using errcode = 'P0001';
  end if;
  if new.org_id is null then
    raise exception 'No organization for vendor' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendors_set_org on public.vendors;
create trigger trg_vendors_set_org before insert on public.vendors
  for each row execute function public.vendors_set_org();

-- Org-scoped RLS (replaces `true` SELECT + the project-role write gates; vendors is
-- org-level, not project-level). The trigger guarantees org_id is the caller's org,
-- so the INSERT check passes for legitimate creates and blocks foreign-org rows.
alter policy vendors_select on public.vendors using (public.user_is_org_member(org_id));
alter policy vendors_insert on public.vendors with check (public.user_is_org_member(org_id));
alter policy vendors_update on public.vendors
  using (public.user_is_org_member(org_id)) with check (public.user_is_org_member(org_id));
alter policy vendors_delete on public.vendors using (public.user_is_org_member(org_id));

notify pgrst, 'reload schema';
