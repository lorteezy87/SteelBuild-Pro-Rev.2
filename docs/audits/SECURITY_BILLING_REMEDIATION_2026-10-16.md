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
