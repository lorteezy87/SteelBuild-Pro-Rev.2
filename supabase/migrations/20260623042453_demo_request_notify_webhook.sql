-- Fire a webhook (pg_net) on each new demo_requests row. The destination URL is
-- read from Vault secret 'demo_request_webhook_url'; until that secret is set the
-- trigger is a NO-OP. A notification failure can NEVER break lead capture — the
-- whole body is wrapped so any error is swallowed and the INSERT still commits.
--
-- To activate: set the Vault secret to your catch-hook URL (Slack incoming
-- webhook, Make/Zapier "Webhook -> Email", or any endpoint), e.g.
--   select vault.create_secret('https://hooks.slack.com/...', 'demo_request_webhook_url');
-- The POST body is the raw lead JSON ({type,name,email,company,tonnage,message,created_at}).
create or replace function public.notify_demo_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook_url text;
begin
  begin
    select decrypted_secret into hook_url
    from vault.decrypted_secrets
    where name = 'demo_request_webhook_url'
    limit 1;

    if hook_url is null or btrim(hook_url) = '' then
      return new; -- not configured yet
    end if;

    perform net.http_post(
      url := hook_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'type', 'demo_request',
        'name', new.name,
        'email', new.email,
        'company', new.company,
        'tonnage', new.tonnage,
        'message', new.message,
        'created_at', new.created_at
      )
    );
  exception when others then
    null; -- never let a notification failure break lead capture
  end;
  return new;
end;
$$;

drop trigger if exists demo_request_notify on public.demo_requests;
create trigger demo_request_notify
  after insert on public.demo_requests
  for each row execute function public.notify_demo_request();
