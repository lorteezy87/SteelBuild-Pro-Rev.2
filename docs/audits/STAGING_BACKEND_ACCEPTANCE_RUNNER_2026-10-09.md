# Bounded staging backend acceptance runner

Source candidate only. No hosted dispatch, deployment, provider configuration,
new identity, MFA enrollment, payment, email delivery, or erasure was performed
while implementing this runner. This is partial acceptance evidence, not an
enterprise readiness or seven-handler MFA signoff.

## Execution boundary

`.github/workflows/staging-backend-acceptance.yml` is manual and main-only. Before
staging credentials become available, it validates an exact lowercase commit
already reachable from the dispatching main commit and requires all four source
jobs from the same completed `ci.yml` push run for that exact candidate:

- Lint + Typecheck + Test + Build
- Secret scan (gitleaks)
- Release Edge Function typecheck
- Commercial SQL + concurrent PostgreSQL acceptance

The execution job uses the existing protected `staging-backend` environment,
which must remain restricted to main in repository settings. It checks out the
exact verified SHA without persisted Git credentials and runs native Node 24
TypeScript. It does not install dependencies or execute package install hooks.
Only existing `STAGING_E2E_USER`, `STAGING_E2E_PASS`,
`STAGING_E2E_SUPABASE_URL`, and `STAGING_E2E_SUPABASE_ANON_KEY` are consumed. No PAT,
service-role secret, provider key, TOTP seed, or new credential is requested.

The fixed API target is `ndyfjffsulfbwpmwdmic`; production is rejected. The only
parent fixture is STG-0001 / STAGING — Warehouse Expansion in Example Fabrication
(staging), with exact committed project and organization UUIDs. Parent identity,
organization, name, number and active state must match before an authorized
export is possible. Existing credential ownership does not establish synthetic
user metadata or MFA enrollment; fresh Auth responses supply actual evidence.
The historical one-time bootstrap is neither called nor repointed.

## What the runner can prove

Fresh password authentication is followed by Auth `GET /auth/v1/user` with the
same token, matching subject and email, explicit AAL, staging issuer, authenticated
role and future expiry. Current verified factor status comes from Auth, never
user metadata. A final Auth read detects enrollment changes during acceptance.
No shared account factor is enrolled, challenged, reset, removed or replaced.

| Handler | Bounded request | Evidence / limit |
| --- | --- | --- |
| All seven | Authenticated GET, anonymous safe POST | Exact method 405 and unauthenticated 401 where configuration permits. Platform JWT rejection is authentication evidence, not proof the handler ran. |
| llm-proxy | Unknown provider and model | Authorized validation 400, or enrolled AAL1 `mfa_required` 403; no provider invocation. |
| email-send | Empty object | Missing-project 400, or enrolled AAL1 403; no recipient or message payload. |
| command-center-session-handoff | Exact create shape with empty state/challenge and null encrypted session | Invalid-input 400 after authentication, or enrolled AAL1 403. No valid create or redeem payload is possible. |
| command-center-read | One project entity, exact project UUID, limit one | Scoped result and exact staging project link, or enrolled AAL1 403. Recognized missing service configuration is INCOMPLETE. |
| stripe-billing | Unknown action and exact organization UUID | Rejection only. Recognized absent explicit mode/key is INCOMPLETE, never successful provider or MFA acceptance. Checkout, portal and signed webhook requests are absent. |
| account-delete | Empty object only | Missing-org validation 400. No account mode, organization ID, sentinel or erasure call. This does not test its authenticated MFA/erasure paths. |
| project-export | Exact verified synthetic project UUID | Authorized v2 export in memory; complete table keys, project/organization scope, row/file count consistency, and exclusion of mailbox access/refresh credential columns. Not attempted with enrolled AAL1 or unconfirmed parent. |

Successful export intentionally retains the existing server-written `activities`
audit (`action=exported`, `entity_type=Project`). Before/after reads are restricted
to the exact actor and project and at most ten rows. Acceptance requires exactly
one newly observed audit ID with matching project, actor, v2, table, row and file
counts. No extra audit record is written by the runner. Concurrent export by the
same account can make this bounded comparison inconclusive/fail; do not bypass
the audit or retry automatically. Auth sign-in also creates the ordinary Auth
session/audit state. This workflow therefore is not a claim of zero database
writes; it performs bounded reads/rejections plus the normal export audit.
The summary reports the number of mailbox rows inspected. An empty mailbox
table remains an explicit untested nonempty credential-redaction case.

## Transport and evidence containment

Named request profiles are closed: no arbitrary URL, method, payload or header
input exists. Each profile is usable once. There are at most 32 requests, a
four-minute aggregate deadline, 15-second ordinary / 45-second export request
timeouts, 128 KiB ordinary / 4 MiB export streamed response limits and 8 MiB total.
Export validation permits at most 10,000 rows, references and storage entries.
Exceeding limits fails instead of treating partial evidence as a complete export.
Fetch redirects are forbidden and responses claiming a redirect are rejected.
Only the fixed Supabase origin is addressed. No Storage bytes are downloaded.

Only `test-results/backend-acceptance/summary.json` is retained for seven days.
It contains candidate SHA, closed case/reason identifiers, HTTP status, aggregate
counts, AAL and verified-factor count. It excludes credentials, session tokens,
user IDs/email, factor metadata, request/response/export bodies, raw errors and
stack traces. Error diagnostics retain only the bounded stage. There are no
screenshots, traces, auth-state files or response dumps.

## Meaning of the result

`FAIL` exits 1 for an unexpected response, invalid proof, transport boundary,
identity change, missing audit or failed assertion. `INCOMPLETE` exits 2 even if
all attempted checks pass. It cannot turn into a successful production acceptance
gate. Required untested capabilities remain explicit: AAL2 step-up and the full
seven-handler matrix; real erasure/identity cleanup; provider keys, price map,
checkout, webhook and email delivery; cross-tenant and revoked-session checks;
Storage file bytes and restoration. An unenrolled AAL1 control is not an MFA
bypass test. Expected configuration 503 is not service readiness.

The report's candidate SHA identifies reviewed runner/source code, not installed
hosted bundles. The release owner must separately compare exact deployed source,
JWT settings and prerequisite SQL hashes to the chosen candidate before dispatch.
This does not replace the production five-check source gate, required reviewer,
same-source staging evidence, rollback capture or release authorization.

## Local validation

Policy, Auth proof, v2 export, audit, redaction, runner and workflow source-gate
regressions run under Vitest without hosted requests. A real loopback 307 test
proves a password request never reaches its redirect destination. Main CI runs
these isolated tests only; it never imports or executes the hosted CLI.

First-pass skeleton reproduced 18 failing cases. Additional end-to-end fixtures
reproduced incorrect handoff-error and project-link assumptions before aligning
the runner with the actual handlers. Focused test totals and source SHA are
recorded in the pull request after the final validation pass.

The current Supabase [MFA TOTP documentation](https://supabase.com/docs/guides/auth/auth-mfa/totp)
requires challenge/verification to establish AAL2; listing verified factors is
not second-factor proof. This runner deliberately does not create that proof.
