-- Billing on the org (Stripe subscriptions) — multi-tenant SaaS P0.
-- The plan is the entitlement anchor; only the billing system (the webhook,
-- via the service role) may change the plan/subscription fields. A trigger
-- blocks AUTHENTICATED users from tampering with them directly — otherwise an
-- org admin could self-upgrade by updating organizations.plan, making
-- entitlement gating meaningless.

alter table public.organizations
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status    text,   -- active | trialing | past_due | canceled
  add column if not exists current_period_end     timestamptz;

create index if not exists idx_org_stripe_customer on public.organizations (stripe_customer_id);

-- Webhook idempotency + audit. Service-role only (RLS on, no policies = locked).
create table if not exists public.billing_events (
  id              uuid primary key default gen_random_uuid(),
  stripe_event_id text unique not null,
  type            text,
  org_id          uuid references public.organizations (id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table public.billing_events enable row level security;

-- Guard: authenticated users cannot change billing fields (only the webhook /
-- service role + migrations can). auth.role() is 'authenticated' for app users,
-- 'service_role' for the webhook, NULL in a migration/superuser context.
create or replace function public.org_protect_billing_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and (
       new.plan                   is distinct from old.plan
    or new.stripe_customer_id     is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.subscription_status    is distinct from old.subscription_status
    or new.current_period_end     is distinct from old.current_period_end
  ) then
    raise exception 'Billing fields can only be changed by the billing system' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_org_protect_billing on public.organizations;
create trigger trg_org_protect_billing
  before update on public.organizations
  for each row execute function public.org_protect_billing_columns();

notify pgrst, 'reload schema';
