# Email sending accounts (SEC-N1)

Owner runbook for the outbound-mail lockdown: migration
`supabase/migrations/20260923120000_email_sender_lockdown.sql` (placeholder
version, rename at apply time) plus the `email-send` Edge Function change.

## What changed and why

Before this change, any project member at `field` or above could add an
`email_accounts` row with any address, and `email-send` would send as it
through the platform's Resend account or Microsoft Graph app. A self-signed-up
user owns their own org, so an admin-only rule alone does not stop them. Now
three things must all agree before a message leaves:

| Check | Where it lives | Who can change it |
|---|---|---|
| Address is an **active account on the project** | `email_accounts` | Project/org **admins** (RLS) |
| Address is **verified for the project's org** | `email_verified_senders` | **Service role only** (platform operator) |
| Address's domain is **enabled on this platform** | `EMAIL_SEND_ALLOWED_DOMAINS` secret | Platform owner |

The hourly cap is now counted in `email_send_events` via `email_send_reserve()`,
both service-role only. Members can no longer reset it by deleting their sent
messages.

## Behaviour change for existing accounts

**After the function is deployed, every existing account stops sending** until
the operator verifies it for its org **and** its domain is in
`EMAIL_SEND_ALLOWED_DOMAINS`. Senders get HTTP 403 with a message telling them
to contact support; HTTP 503 means `EMAIL_SEND_ALLOWED_DOMAINS` is unset.
Inbound mail (forwarding / Power Automate into `email-ingest`) is unaffected.

Existing non-admin users lose add/edit/delete on email accounts as soon as the
migration is applied. They keep read access.

## Release order

1. Apply the migration to staging, then production, stamping it by hand
   (`CLAUDE.md`, "Applying a migration"). Then rename the file **and** its
   `required` entry in `supabase/production-ownership-manifest.json` to the
   ledger version, and record the payload hash in that entry. Until then the
   `Supabase drift check` reports the version as missing. That is expected:
   do not change the entry's lifecycle to silence it. The old function keeps
   working against the new schema.
2. Set the secrets below on the target project.
3. Seed `email_verified_senders` for the accounts you intend to keep (below).
4. Deploy `email-send`. If you deploy it before step 1, sending fails closed
   with 503 because the ledger RPC and verified-sender table are missing.

## Secrets (`supabase secrets set …`)

| Name | Required | Meaning |
|---|---|---|
| `EMAIL_SEND_ALLOWED_DOMAINS` | **Yes** | Comma-separated domains the provider may send for, e.g. `steelbuild-pro.com,customer.example`. Exact match, so list subdomains explicitly. Unset or blank disables all sending. |
| `EMAIL_SEND_HOURLY_LIMIT` | No | Per-user sends per rolling hour. Default `100`. `0` disables the cap (sends are still logged). A malformed value falls back to 100. |
| `RESEND_API_KEY` | One provider | Resend. Every domain in the allowlist must be verified in Resend. |
| `MS_GRAPH_CLIENT_ID` / `_SECRET` / `_TENANT_ID` | One provider | Graph app-only. If all three are set, Graph takes precedence. See the Graph warning below first. |

## Verifying a sender (service role, SQL editor)

Inventory the addresses projects currently use (read-only):

```sql
select p.org_id, lower(a.email_address) as address, count(*) as projects
from public.email_accounts a join public.projects p on p.id = a.project_id
where a.is_active and not coalesce(p.is_deleted, false)
group by 1, 2 order by 1, 2;
```

Before you add a row, get proof that the org controls the address. For
example, send a one-time code to the mailbox and have the org admin read it
back. For a customer domain, also verify the domain in the provider. Then:

```sql
insert into public.email_verified_senders (org_id, email_address, verified_by, verification_note)
values ('<org uuid>', 'projects@customer.example', 'ops:<your name>', '<how control was proven, ticket #>');
```

An address can be actively verified for only one org, compared
case-insensitively. To revoke it:

```sql
update public.email_verified_senders set revoked_at = now()
where lower(email_address) = lower('projects@customer.example') and revoked_at is null;
```

Never verify an address on the platform's own domain for a customer org unless
that mailbox was provisioned for that customer. Addresses like `support@` or
`billing@` would let the customer impersonate the platform.

## Microsoft Graph: restrict the app itself (tenant owner action)

Graph uses app-only credentials (`client_credentials`). With the
`Mail.Send` application permission, the app registration can send as **every
mailbox in the tenant**. The database checks above are the application-side
control. The Exchange-side control is what bounds the credential if the app, its
secret, or a future code path is compromised. Do this before enabling Graph:

```powershell
Connect-ExchangeOnline
# Mail-enabled security group holding only the approved sending mailboxes
New-DistributionGroup -Name "SteelBuild Pro senders" -Type Security -PrimarySmtpAddress sbp-senders@<tenant-domain>
Add-DistributionGroupMember -Identity sbp-senders@<tenant-domain> -Member projects@<tenant-domain>
New-ApplicationAccessPolicy -AppId <MS_GRAPH_CLIENT_ID> -PolicyScopeGroupId sbp-senders@<tenant-domain> `
  -AccessRight RestrictAccess -Description "SteelBuild Pro email-send: approved mailboxes only"
# Expect Granted for a member and Denied for anyone else (propagation can take an hour or more)
Test-ApplicationAccessPolicy -Identity projects@<tenant-domain> -AppId <MS_GRAPH_CLIENT_ID>
Test-ApplicationAccessPolicy -Identity <some-other-user>@<tenant-domain> -AppId <MS_GRAPH_CLIENT_ID>
```

Microsoft now positions **RBAC for Applications in Exchange Online** as the
successor to application access policies. It uses `New-ManagementScope`
scoped to the same group, plus `New-ManagementRoleAssignment -Role "Application Mail.Send"`.
If you use it, remove the unscoped `Mail.Send` application consent in Entra ID.
Entra grants are unscoped and add to the RBAC grant, so leaving the consent in
place removes the restriction. Check Microsoft's current documentation before
choosing.

**Current state of the Graph path:** `getMsGraphToken` in
`supabase/functions/email-send/index.ts` requests
`/oauth2/v2/token`, but the Microsoft identity platform endpoint is
`/oauth2/v2.0/token`. As written, the Graph path cannot obtain a token, so if
all three `MS_GRAPH_*` secrets are set, every send returns 502. Do not correct
that URL until the access policy above is in place and tested.

## How to verify (staging)

1. As a `pm` or `field` user, insert into `email_accounts` through the app or
   REST. RLS must reject it. As a project or org admin, the insert succeeds.
2. As an admin, add an unverified address and send from the Email Inbox. You
   should get a 403 that says the address is not verified.
3. Insert the `email_verified_senders` row and make sure its domain is in
   `EMAIL_SEND_ALLOWED_DOMAINS`, then send again. You should get a 200. The
   stored `email_messages.sender_email` is that address.
4. As any authenticated user, `select` from `email_send_events` or
   `email_verified_senders`, or call `rpc/email_send_reserve`. Each must fail
   with `permission denied`.
5. Set `EMAIL_SEND_HOURLY_LIMIT=2` and send three times. The third returns 429.
   Delete your sent `email_messages` rows and send again. It is still 429.

Watch sending volume with (service role):

```sql
select user_id, project_id, from_address, outcome, count(*)
from public.email_send_events
where created_at > now() - interval '24 hours'
group by 1, 2, 3, 4 order by 5 desc;
```

## Not covered here

`email_accounts.access_token` / `refresh_token` are still readable by project
members (audit DB-9). Nothing in the product writes them today. The fix is the
same pattern as `email_verified_senders`: move them into a service-role-only
table.
