# Security and billing remediation — October 16, 2026

## Review boundary

This branch starts from current main `fd8c0f0b1`, rather than the older dirty
`codex/steel-executive-hardening` checkout used for the audit. The original
checkout and its 245 staged files were left intact. No database mutation,
provider transaction, staging deployment, production deployment, credential
change, or environment change was performed for this remediation.

Current main already contains the MFA-aware seven-service release source,
durable checkout reservations, atomic webhook handling, and neutral messaging
for legacy checkout returns. This change preserves those protections and adds
session-bound, read-only confirmation. It does not reimplement or relax them.

## Customer behavior

New Checkout sessions return their Stripe session identifier and originating
workspace identifier. These URL values are lookup hints, not proof of payment.
The authenticated `checkout-status` action requires owner/admin membership and
the existing MFA guard before provider access. It retrieves the session using
the configured live/test key, then rechecks membership and reloads the workspace
after the provider wait. A session from another workspace/customer or mode is
rejected without disclosing its content.

Confirmation requires all of: subscription-mode Checkout, completed session,
paid/no-payment-required provider status, recognized Pro/Business plan, matching
provider customer and subscription IDs, and the same active/trialing entitlement
installed by the signed webhook. Confirmation never writes an entitlement,
creates a customer/subscription/session, or processes a webhook receipt.

The UI polls sequentially every two seconds for at most 30 seconds, including a
deadline for a hung lookup or workspace refresh. It exposes pending/error
recovery through a read-only Check again button. Expired sessions are identified
without a payment-success claim. Unmount, role loss, and workspace-generation
changes suppress stale results, including A → B → A. Native purchase restrictions
remain intact. Legacy return links retain main's neutral message. An already-open
durable Checkout session may still have its original legacy return URL; it is not
replaced or replayed merely to add the new query parameters.

## Production security package for review

Fresh production source inspection found the following older bundles. All seven
local entrypoints already use `mfaDenialForVerifiedUser`; none of the downloaded
production bundles contains that explicit guard. This is a deployed-source gap,
not a claim that unauthenticated callers can use these services or a completed
hosted exploit test.

| Function | Production version observed | Preserve gateway JWT |
| --- | ---: | --- |
| llm-proxy | 44 | false; internal bearer authentication |
| email-send | 31 | true |
| project-export | 31 | true |
| command-center-read | 14 | false; internal bearer authentication |
| command-center-session-handoff | 15 | false; internal bearer authentication |
| stripe-billing | 31 | false; internal authentication / signed webhook |
| account-delete | 4 | true |

The proposal is to release the exact current source closures of these seven
functions, including the billing confirmation addition. This is more than a
one-line MFA patch relative to the old production bundles: current main also
contains reviewed checkout, webhook, export, telemetry and account-erasure
corrections. Review the complete source closures in the manifest, not just this
branch's diff. `email-ingest`, `health`, maintenance, deprecated functions and
the sibling application are outside this proposed function release.

Evidence lives in `docs/audits/evidence/security-billing-2026-10-16/`:

- `hosted-before.json`: production and staging versions, bundle hashes, JWT
  settings, and production source inventory; this is not a data backup.
- `production-prerequisites.json`: 17 sampled security/commercial prerequisite
  ledger payload hashes. All 17 matched the corresponding local SQL files exactly.
- `source-manifest.json`: candidate source commit and SHA-256 of every local
  transitive file in the seven proposed function bundles.

No new SQL is introduced or proposed. Do not replay already-installed migrations.
The prerequisite sampling is not a replacement for the complete drift gate or
effective hosted-behavior acceptance.

## Release sequence after review

1. Select the final merged main SHA. Require all five existing CI gates together:
   application CI, secret scan, production drift, Edge typecheck and commercial
   PostgreSQL acceptance. Regenerate/review source hashes if any function bytes change.
2. Use `supabase-deploy-reviewed.yml` for each of the seven allowlisted functions
   on that exact SHA against staging. Preserve its separate environment-scoped
   credential and JWT controls. Do not copy production secrets into staging.
3. Read back each deployed source closure and JWT setting. Require matching hashes.
   Exercise enrolled AAL1 denial, authorized AAL2 controls, foreign workspace denial,
   and ownership loss. Existing bounded acceptance deliberately reports incomplete
   coverage as incomplete; do not convert that result into release approval.
4. In staging with its own Stripe test configuration, complete test-mode Checkout,
   delayed webhook confirmation, replay, failed/expired payment, cancellation,
   stale/foreign session and owner-revocation cases. Confirm exact subscription
   identity and no duplicate customer/session/subscription. Also accept the seven
   service-specific operations, including synthetic account-erasure recovery.
5. Present that exact SHA, staging readback/acceptance evidence, and rollback
   artifacts for owner production approval. Provision any missing environment
   secrets through the existing secret-management flow; never put values in reports.
6. After approval, deploy one production function at a time through the same
   gated workflow, retaining each before-source artifact and inventory. Read back
   and verify bytes/JWT modes and non-destructive production controls. Release the
   frontend only through the current five-job-gated Sites release handoff in
   `docs/runbooks/sites-release.md`, after billing is ready. Cloudflare remains
   staging/preview infrastructure; it is not the production publisher.

The workflow already captures rollback source before replacement. If a release
fails, stop further publication and evaluate rollback of the affected function
from that retained artifact with the preserved JWT mode. Rolling back to the old
bundles reopens the identified MFA gap; do not describe rollback as security closure.
Frontend rollback does not roll back backend services or provider transactions.

## Remaining acceptance and audit work

Local verification for this slice includes 262 focused billing/MFA tests in 17
files, 120 desktop/mobile foundation browser checks, all seven proposed Edge
entrypoint Deno checks, lint, hook rules, TypeScript/JavaScript compilation, both
type ratchets, the no-new-JavaScript gate, production build and bundle budgets.
The focused tests exercise the actual billing handler against mocked provider
and database boundaries; they do not contact Stripe or the hosted database.
The UI tests include TanStack's resolved error result during workspace refresh,
which must not be labeled as a successfully refreshed plan.

The broader unit run passed 8,976 tests across 888 files with no skipped tests
or failures. That run began before the final UI test additions and refresh-error
guard; the final 262-test focused run and fresh build/typecheck/lint validate
those last changes. The raw local full-suite report is retained at
`.tmp/audit-security-billing-vitest.json` (ignored, not release evidence from CI).

Hosted payment lifecycle tests, account-erasure acceptance, final-main CI,
same-commit staging deployment/readback, production approval and deployment remain
open. Passing local tests does not close those gates. The five high development
toolchain advisories remain separate work; no dependency override was weakened.
Executive actuals completeness, verified backups/restores, first-project onboarding,
connector prioritization and paid-pilot measurement follow this security/billing
slice in audit priority order.

## Authorized follow-up: staging and reporting

The follow-up retains PR #557 as a draft production review candidate. No production
deployment, merge, production database write or Stripe charge was performed.
The shared original checkout and its staged edits were left untouched.

### Staging results and release boundary

On the existing staging project `ndyfjffsulfbwpmwdmic`:

- `server-mfa/readiness.sql` returned no configuration gaps. This establishes
  installed hook/policy configuration, not real Auth-issued AAL1/AAL2 HTTP behavior.
- All 17 sampled prerequisite migration ledger payload hashes match the earlier
  production evidence. Staging has 144 public tables, all with RLS; the table count
  differs from production and is not a claim of complete schema parity.
- `stripe-billing/staging-acceptance.sql` passed all 20 assertions against installed
  functions, grants, policies and guards. The checkout companion passed all 20.
  They cover duplicate/stale events, cancellation, unauthorized receipt/plan writes,
  foreign-workspace reads, durable reservations, conflicting bindings and erasure.
- Both suites initially failed on their own temporary helper permissions under
  hosted default privileges. Explicit EXECUTE grants now apply only to the
  rollback-scoped `pg_temp` helpers. Application grants and default privileges
  were not changed. Rerunning both suites passed.
- All fixtures rolled back. A fresh read confirmed zero fixture users and zero
  fixture organizations remaining. These were sequential transactions, not a new
  hosted concurrency test and not a Stripe delivery test.

Sanitized evidence: `evidence/security-billing-2026-10-16/staging-followup.json`.
The seven backend source closures remain unchanged: all 49 manifest entries match.

Hosted acceptance remains **INCOMPLETE** for concrete reasons:

1. `staging-backend` has a `main`-only branch policy and a required owner reviewer.
   This draft candidate is not merged to main. The bounded acceptance workflow also
   requires a main-reachable candidate. Neither protection was weakened or bypassed.
2. Staging's `billing_config` returned zero rows. Real test-mode checkout cannot
   proceed until isolated Stripe test prices, webhook secret and `livemode=false`
   configuration are provisioned, with test-key availability verified through the
   secret-management flow. No production configuration or secret was copied.
3. Candidate deployment/readback, enrolled AAL1/AAL2 HTTP checks, successful
   service-specific operations, real signed Stripe delivery, delayed/replayed
   webhook confirmation and browser payment lifecycle therefore remain open.

### Executive reporting correction

`executiveLabor.ts` distinguishes missing/blank/invalid hours from explicitly
recorded zero. Budget and actual series are independently withheld when incomplete;
partial entered hours are labeled as partial. Labor Burn is unavailable for missing
inputs, a nonpositive budget, no work packages, or a portfolio project with no labor
records. The chart explains missing values instead of drawing zero-hour claims.
The spend KPI is labeled Recorded Spend, and an absent cost-code budget says Budget
not recorded. Canonical spend arithmetic is preserved. Recorded/defaulted zero in
the database cannot be distinguished from a human-attested zero by these columns;
this change does not invent provenance or certify ledger completeness.

### Piece Register correction

The limited attention panel is now Assignments, weights & holds. Its empty state
says No assignment, weight or hold issues and directs users to Changes & Risks
for revision exposure. No risk calculations, release gates, permissions or piece
states were changed.

### Production review sequence

Review the complete PR and function manifest first. After integration to main and
all five required exact-commit jobs passing, use the existing reviewed deployment
workflow for the seven staging functions, satisfy the owner-review environment
gate, verify deployed bytes/JWT settings, and configure isolated Stripe test mode.
Complete the hosted cases above before considering production approval. The final
main SHA, CI run, source readback and hosted acceptance must be added to this packet;
this document is not approval to publish an untested candidate.

Follow-up local verification: 35 focused tests across three files passed, including
rendered ExecutiveView tests for unknown actuals, explicit zero, and projects
without labor records. The local SQL fixture suites passed 22 atomic-billing and
28 durable-checkout checks after installing their pinned test-only dependencies
with lifecycle scripts disabled. Lint, TypeScript, JavaScript typecheck, both
shrink-only typing gates, no-new-JavaScript, build and bundle budgets passed.
Initial assets are 124.5 KB gzip; total generated assets are 3228.6 KB gzip.
The two new production UI changes have component/source-wiring coverage; an
authenticated rendered browser review of the new candidate is still pending.
The earlier CI counts belong to the earlier SHA; they are not the final follow-up
commit's CI result. Use the new PR checks for the latter.

## CI and staging closeout continuation (2026-10-17)

The user authorized reviewing/merging PR #557 and staging testing while explicitly
holding production. Current main was merged into the isolated branch, preserving
the new macOS/store-shell restrictions and the reviewed CORS changes. The seven
function manifests were regenerated against those source bytes, with the closure
hash algorithm now stated explicitly. The earlier 49-file equality claim is a
historical checkpoint, not a claim that CORS stayed byte-identical after integration.

The remaining dependency failure was GHSA-vfj7-8cjw-p6xm in braces, inherited by
Tailwind 3, chokidar, fast-glob and micromatch. Upstream reports no patched braces
release. Tailwind/PostCSS were upgraded together to 4.3.3; the vulnerable chain is
removed and npm audit reports zero vulnerabilities. No advisory allowlist, scanner
exception, fabricated package version or local dependency fork was introduced.
The existing JavaScript theme config is explicitly loaded; application token/theme
files remain authoritative. Tailwind 4 requires modern browsers (Safari 16.4+,
Chrome 111+, Firefox 128+). This is a build integration upgrade, not proof that
every authenticated screen has received visual acceptance.

Local build, lint and TS/JS checks passed. The existing 120 fixture browser checks
passed. An added utility test initially assumed a 16px root font instead of the
app's 14px; after correcting that assertion, both desktop/mobile checks passed,
including actual grid spacing and light/dark configured token colors. Screenshots
were inspected. The fixture is not an authenticated production workflow.
An additional 101 focused tests passed, including checkout confirmation and the
RFC 6238 TOTP vectors used by the staging acceptance runner.

The existing main-only staging acceptance workflow now also exercises Auth-issued
enrolled AAL1/AAL2 sessions on the synthetic staging.pm account. It refuses an
unexpected fixture or existing factor, enrolls a temporary TOTP factor, probes
Data API and bounded Edge boundaries, and removes/readbacks the temporary factor
in finally. It retains sanitized outcomes only; secrets and provider/user response
bodies are not logged. The probes do not send email, invoke a real model, create
handoff tokens, charge Stripe or request account erasure. AAL2 validation rejection
is not described as successful provider operation acceptance. Missing Stripe
configuration remains INCOMPLETE, not PASS. Storage/Realtime and full provider
operations remain separately identified coverage limits.

The connected Stripe tool currently returns UNAUTHORIZED / requires reauthentication.
An asynchronous reconnect request was presented. No live account was selected,
no Stripe resource or key was provisioned, and no production configuration changed.

### Isolated sandbox follow-up

The stale connector was avoided using Stripe's officially supported anonymous CLI
sandbox flow, with a separate task-local profile and the existing Git user identity.
Sandbox `acct_1URGW3IfnOAuiBXv` expires October 24 unless claimed. The profile has
no live key. Test Pro/Business prices and the staging-only webhook were created;
each returned `livemode=false`. The CLI-restricted key cannot read Balance, so no
balance access was used or represented as proof; the actual created objects prove
test mode. No real payment or live Stripe configuration was touched.

Staging's previously empty billing_config was populated with `livemode=false`,
the two test prices and its own webhook signing secret. The test-only key is in
the encrypted staging-backend environment secret STAGING_STRIPE_TEST_KEY. The
reviewed deploy workflow provisions only STRIPE_SK_TEST and a fixed staging return
origin, only when target=staging AND function=stripe-billing. Production's live
key and configuration are outside that step. Gate tests assert this isolation.
Task-local CLI credentials are under an access-restricted ignored directory;
no secret values are stored in repository files or review evidence.

The protected acceptance workflow includes optional start/verify billing probes.
Start creates a disposable synthetic workspace through the authenticated creation
RPC and checks repeat Checkout requests return the exact same test session URL.
Verify reads exact-session status, workspace entitlement and receipts. Artifacts
may intentionally contain a test Checkout URL for the browser operator, retained
one day, but never Auth sessions or provider/webhook keys. These probes always
remain INCOMPLETE as release acceptance; a URL or status snapshot is not proof of
the full payment lifecycle. Real browser payment, signed webhook processing,
replay, expiry, cancellation and hosted MFA results must still be recorded.

The secret scan's RFC 6238 fixture match is covered by one exact known-public
test-vector regex, with its RFC citation. It is not an API key and no broad path
or rule exclusion was added. Current dependency and secret scans passed before
the final staging-tooling additions; final exact-head CI must be checked again.
