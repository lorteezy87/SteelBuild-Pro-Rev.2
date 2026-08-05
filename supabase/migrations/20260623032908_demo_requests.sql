-- Public demo-request capture for the landing-page "Request a demo" form.
-- Anonymous landing visitors may INSERT (column-scoped + bounded); only global
-- admins (user_profiles.role = 'admin') may read. No UPDATE/DELETE for anyone
-- but service_role (no policy => denied).
create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  company text,
  tonnage text,
  message text,
  status text not null default 'new',
  source text not null default 'landing'
);

create index if not exists demo_requests_created_at_idx on public.demo_requests (created_at desc);

alter table public.demo_requests enable row level security;

-- Anyone (incl. anonymous) may submit a demo request, restricted to the public
-- form columns; id/created_at/status/source always take their defaults.
grant insert (name, email, company, tonnage, message) on public.demo_requests to anon, authenticated;
create policy "demo_requests public insert" on public.demo_requests
  for insert to anon, authenticated
  with check (
    char_length(coalesce(name, '')) between 1 and 200
    and char_length(email) between 3 and 320
    and position('@' in email) > 1
    and char_length(coalesce(company, '')) <= 200
    and char_length(coalesce(tonnage, '')) <= 100
    and char_length(coalesce(message, '')) <= 5000
  );

-- Only global admins may read/triage demo requests.
grant select on public.demo_requests to authenticated;
create policy "demo_requests admin select" on public.demo_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.role = 'admin'
    )
  );

notify pgrst, 'reload schema';
