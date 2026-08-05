-- billing_config — server-managed Stripe config (price IDs + webhook signing
-- secret) so stripe-billing can be provisioned via the Stripe API without
-- manually setting edge-function env secrets (which can't be written at runtime).
-- Single 'default' row. Service-role only: RLS ON, NO policies, grants revoked —
-- so no client role (anon/authenticated) can read the webhook secret. The edge
-- function uses the service-role key, which bypasses RLS.
create table if not exists public.billing_config (
  scope                       text primary key default 'default',
  stripe_price_pro            text,
  stripe_price_business       text,
  stripe_webhook_secret       text,
  stripe_webhook_endpoint_id  text,
  livemode                    boolean,
  updated_at                  timestamptz not null default now()
);

alter table public.billing_config enable row level security;
revoke all on public.billing_config from anon, authenticated;

insert into public.billing_config (scope) values ('default')
  on conflict (scope) do nothing;
