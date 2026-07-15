# Phase 0 Staging Candidate Plan

Status: Batch 43A read-only audit complete; candidate frontend staging deployment observed, database and Edge Functions not deployed by this audit.

This plan is an execution checklist for the owner/operator. It contains names,
commands, and expected values only. Credentials, tokens, passwords, service
keys, database URLs, and production data must be supplied through the approved
secret stores at execution time and must never be copied into this document.

## Entry decision

Batch 41 found no reproducible code-level P0 defect. The documented legacy flat
Storage finding is accepted for the current single-tenant application because
the available evidence does not show an active leak. It is deferred, not
resolved: it is a hard gate before onboarding organization #2 and must be
reviewed together with the legal-review gate. Staging must still verify the
current Storage policy and legacy-object inventory before any multi-tenant
milestone.

The remaining Batch 41 P1 items are staging or owner gates. They are not
silently marked complete by this plan.

Batch 42 readiness result: repository-controlled entry criteria pass. The
external staging gates below remain unchecked until the approved operator runs
Batch 43 against the isolated targets and records evidence.

## Candidate identity

| Field | Value or capture rule |
| --- | --- |
| Source repository | `lorteezy87/SteelBuild-Pro-Rev.2` |
| Source branch | `agent/handoff-cleanup` |
| Preparation base SHA | `a86c18ffcf00359b7a798b9be5822c18199565c7` |
| Promotion SHA | Full SHA from `git rev-parse HEAD` after this documentation commit; never use a mutable branch name alone |
| Short SHA | First seven characters of the promotion SHA |
| Application version | `2.1.1` from `package.json` |
| Build timestamp | `completedAt` from the CI run for the exact promotion SHA; do not hand-edit a timestamp into source |
| Build fingerprint | CI deploy builds set `VITE_APP_VERSION` to the commit SHA; local builds safely omit it |
| Migration set | All files under `supabase/migrations/`, with the six PR #77 feature-flag migrations listed below as the candidate delta |
| Edge Function set | `_shared` plus `account-delete`, `email-ingest`, `email-send`, `health`, `llm-proxy`, `project-export`, `schedule-assistant`, and `stripe-billing` |
| Expected Vercel environment | Separate project `steelbuild-pro-staging`; Git auto-deploy remains disabled |
| Expected Supabase environment | Separate staging Supabase project and database recorded in `docs/runbooks/staging-setup.md`; never the production project |
| Expected Stripe environment | Test mode only, with staging webhook endpoint |
| Expected Sentry environment | Separate staging environment/release, or an explicitly approved staging release namespace |

Before execution, record the final SHA, CI run URL, CI completion timestamp,
Vercel deployment ID, staging Supabase project reference, and migration/Edge
Function deployment receipts in the evidence log. Do not record secret values.

## Staging isolation contract

- Vercel staging must be a separate project from `steelbuildpro-og`.
- Supabase staging must have a separate project, database, Auth users, RLS
  state, Storage buckets, and Edge Function secrets.
- Stripe must use test-mode keys, test products, and a staging webhook endpoint.
- Sentry must use a staging environment and commit-based release name.
- LLM, email, Microsoft Graph, and other provider secrets must be staging
  credentials with bounded quotas and documented kill switches.
- No production service-role key, production webhook, customer export, or
  destructive fixture may be used.
- The test organization and project must be throwaway staging data. Do not
  copy customer data into staging.

## Redacted environment matrix

| Variable | Scope | Required | Staging source | Production source | Classification and consumer | Omission behavior |
| --- | --- | --- | --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Yes | Staging project URL | Production project URL | Public; `src/lib/env.ts`, Supabase client | Startup validation fails |
| `VITE_SUPABASE_ANON_KEY` | Browser | Yes | Staging anon/publishable key | Production anon/publishable key | Public; Supabase client | Startup validation fails |
| `VITE_SENTRY_DSN` | Browser | No | Staging DSN or approved public fallback | Production DSN or approved public fallback | Public write-only ingest identifier | Sentry can use its safe fallback or be absent |
| `VITE_APP_VERSION` | Browser/build | No | Exact staging commit SHA | Exact production commit SHA | Public release label; CI supplies it | App version is null locally |
| `MODE`, `DEV`, `PROD` | Build | Vite-provided | Vite build mode | Vite build mode | Non-secret build metadata | Vite defaults apply |
| `SUPABASE_URL` | Edge Function | Yes where used | Staging project config | Production project config | Server-side config | Function health/deploy check fails |
| `SUPABASE_ANON_KEY` | Edge Function | Function-specific | Staging anon key | Production anon key | Server-side public key | Function request fails clearly |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function | Function-specific | Staging service key | Production service key | Secret; server only | Function must not start or must fail closed |
| `ALLOWED_ORIGINS` | Edge Function | Where configured | Staging origin allowlist | Production origin allowlist | Non-secret security configuration | CORS must fail closed or use reviewed default |
| `STRIPE_SECRET_KEY`, `STRIPE_SK_TEST` | Edge Function | Billing | Stripe test-mode secret | Stripe production secret | Secret; `stripe-billing` only | Billing actions fail closed |
| `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | Edge Function | Billing | Test-mode price IDs | Production price IDs | Server configuration | Plan action fails clearly |
| `STRIPE_WEBHOOK_SECRET` | Edge Function | Webhooks | Staging webhook secret | Production webhook secret | Secret | Webhook signature validation fails |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Edge Function | Provider-dependent | Staging provider keys and quotas | Production provider keys | Secrets; `llm-proxy`, email classification | Provider call fails closed |
| `LLM_KILL_SWITCH` | Edge Function | Recommended | Staging-controlled switch | Production-controlled switch | Operational control | Default must not enable unsafe fallback |
| `EMAIL_WEBHOOK_SECRET` | Edge Function | Email ingest | Staging webhook secret | Production webhook secret | Secret | Ingest rejects requests |
| `EMAIL_CLASSIFY_DISABLED` | Edge Function | Optional | Explicit staging setting | Explicit production setting | Operational control | Classification behavior follows safe default |
| `RESEND_API_KEY` | Edge Function | Email send | Staging provider key | Production provider key | Secret | Email send fails without claiming success |
| `MS_GRAPH_CLIENT_ID` | Edge Function | Optional email path | Staging app registration | Production app registration | Configuration; not a client secret | Graph path unavailable |
| `MS_GRAPH_CLIENT_SECRET` | Edge Function | Optional email path | Staging secret | Production secret | Secret | Graph path unavailable |
| `MS_GRAPH_TENANT_ID` | Edge Function | Optional email path | Staging tenant | Production tenant | Configuration | Graph path unavailable |
| `E2E_USER`, `E2E_PASS` | Test runner | Dedicated tests only | Dedicated staging account | Never use production | Password is secret; email is sensitive | E2E setup fails fast |
| `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` | Test runner | Dedicated tests only | Staging project | Never use production | URL/key are browser-public | E2E setup fails fast |
| `E2E_BASE_URL` | Test runner | Dedicated tests only | Staging URL | Never use production mutation tests | Test target | Harness uses its documented default only for read-only listing |
| `E2E_FAB_PROJECT_ID`, drawing IDs | Test runner | Fab gate only | Dedicated staging fixtures | Never use production | Test fixture identifiers | Fab tests skip until fixtures exist |
| `STAGING_VERCEL_PROJECT_ID`, `STAGING_VERCEL_TOKEN` | CI | Staging deploy | GitHub secret store | Not used for production | Project ID/token; token secret | Staging deploy cannot run |
| `STAGING_ENABLED`, `STAGING_BASE_URL` | CI | Staging deploy | GitHub Actions variables | Not used for production | Control and URL | Staging job remains skipped |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` | CI | Production deploy only | Separate staging names for staging | GitHub secret store | IDs/config plus token secret | Production deploy cannot run |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | CI/build | Source maps only | Staging Sentry values | Production Sentry values | Token secret; identifiers/config | No source maps are emitted/uploaded |
| `DB_MIGRATE_ENABLED`, `SUPABASE_DB_URL` | CI migration | Explicit opt-in only | Staging DB URL and variable | Production DB URL and variable | URL/password secret and control | Migrations are not applied |
| Feature flags | Database | Operational flags | Staging `feature_flags` rows | Production `feature_flags` rows | Server-managed environment state | Safe defaults remain disabled |

No variable with a service-role key, provider secret, webhook secret, or
database password may use a `VITE_` prefix.

## Migration manifest

The following six files are the feature-flag migration delta in PR #77. They
must be applied in version order in staging only after the owner confirms the
staging database and migration history. Presence in Git is not evidence of
application.

| Migration | Purpose and order | Preconditions and postconditions | Rollback/risk | Status |
| --- | --- | --- | --- | --- |
| `20260703180000_seed_submittal_approved_to_scrub_flag.sql` | Seed scrub flag and description | Confirm `feature_flags` exists; verify the key and description after apply | Non-destructive insert/update; use forward-fix; low lock risk | Staging verification required |
| `20260704000000_seed_submittal_revision_autobump_flag.sql` | Seed revision autobump flag | Confirm feature-flag table; verify key/default/description | Non-destructive; preserve rollout state; low lock risk | Staging verification required |
| `20260704000010_seed_submittal_splitting_flag.sql` | Seed splitting flag | Confirm feature-flag table; verify key/default/description | Non-destructive; forward-fix only; low lock risk | Staging verification required |
| `20260704020010_seed_submittal_drawing_types_flag.sql` | Seed drawing-types flag | Confirm feature-flag table; verify key/default/description | Non-destructive; forward-fix only; low lock risk | Staging verification required |
| `20260704030000_seed_submittal_workday_dues_flag.sql` | Seed workday-due flag | Confirm feature-flag table; verify key/default/description | Non-destructive; forward-fix only; low lock risk | Staging verification required |
| `20260712000000_seed_feature_flag_catalog.sql` | Reconcile the canonical catalog descriptions/defaults | Confirm all nine catalog keys are present; verify enabled and overrides are unchanged for existing rows | `ON CONFLICT` updates descriptions only; do not clear overrides; low lock risk | Staging verification required |

For each migration, capture:

```sql
select version, name
from supabase_migrations.schema_migrations
where version = '<migration-version>';

select flag_key, enabled, user_overrides, description
from public.feature_flags
where flag_key in (
  'account_deletion', 'command_ui', 'revision_ai_diff',
  'submittal_approved_to_scrub', 'submittal_drawing_types',
  'submittal_revision_autobump', 'submittal_splitting',
  'submittal_workday_dues', 'viewer_3d'
)
order by flag_key;
```

The second query must be captured before and after the catalog migration so
existing administrator rollout values and user overrides can be compared.
RLS-enabled tables and RPCs referenced by the application must be checked
against the staging schema; generated types must not be regenerated from an
unknown remote project.

## Edge Function manifest

All functions below are unchanged by PR #77 but are relied upon by the
candidate. Deploy the shared CORS helper configuration first, then functions
in dependency order, and verify each against staging only.

| Function | Frontend caller | Auth and dependencies | Required configuration | Smoke/rollback |
| --- | --- | --- | --- | --- |
| `account-delete` | Settings Danger Zone | Authenticated user; user-scoped client plus service-role cleanup | Supabase URL, anon key, service key, staging origin | Owner-only isolated deletion rehearsal; redeploy prior known-good revision |
| `email-ingest` | Email settings webhook | Webhook secret; service-role writes; optional LLM classification | Supabase URL, service key, webhook secret, OpenAI key, classify switch | Signed staging webhook; disable endpoint or redeploy prior revision |
| `email-send` | Email send service | Authenticated caller and provider calls | Supabase URL, service key, Resend and optional Graph settings | Test email to staging mailbox; disable provider or redeploy |
| `health` | Health-check tooling | Read-only health response; verify auth policy in staging | Supabase URL, anon key, service key if configured | HTTP health request and database check; route back to prior function |
| `llm-proxy` | AI assistant, drawing suggestions, imports, revision diff | JWT plus RLS-scoped request; provider calls and quota RPCs | Supabase keys, provider keys, kill switch, allowed origins | Non-destructive prompt with test data; enable kill switch or redeploy |
| `project-export` | Workspace export | Authenticated caller, RLS client, controlled admin export | Supabase URL, anon key, service key | Export staging fixture only; disable function or redeploy |
| `schedule-assistant` | Schedule assistant hook | JWT and RLS-scoped schedule tools; calls LLM proxy | Supabase URL and anon key, allowed origins | Read-only schedule prompt; disable assistant or redeploy |
| `stripe-billing` | Billing service and Stripe webhook | Authenticated billing actions plus Stripe signature path | Supabase keys, test Stripe keys/prices/webhook secret | Test-mode checkout/webhook; disable test webhook or redeploy |

Function source, deployed revision, `verify_jwt` setting, secrets, quotas,
CORS origin, RPC dependencies, and health evidence must be recorded per
function. No function deployment occurs in Batch 42.

## Feature-flag staging matrix

`command_ui` is retired as a runtime presentation flag and must not be used to
select a UI branch. The retained operational flags use safe disabled defaults
unless a specific staging test below is approved.

| Flag | Staging default | Production default | Workflow and prerequisites | Disable/rollback | Disposition |
| --- | --- | --- | --- | --- | --- |
| `account_deletion` | false | false | Dedicated throwaway account/org only; owner approval | Leave disabled; restore fixture if rehearsed | Disabled; destructive test not included |
| `revision_ai_diff` | false | false | Isolated drawing revision fixture and LLM quota | Disable flag and kill switch | Manual staging validation |
| `submittal_approved_to_scrub` | false | false | Approved-submittal fixture; verify downstream scrub audit | Disable before retry; inspect audit | Manual staging validation |
| `submittal_drawing_types` | false | false | Drawing-type fixture and submittal register checks | Disable and retain source rows | Manual staging validation |
| `submittal_revision_autobump` | false | false | Draft revision fixture; verify audit/history | Disable; no destructive rollback | Manual staging validation |
| `submittal_splitting` | false | false | Parent/subset fixture; verify parent cannot falsely complete | Disable; preserve lineage for forward-fix | Manual staging validation |
| `submittal_workday_dues` | false | false | Date-only fixture across timezone test cases | Disable; retain stamped values for review | Manual staging validation |
| `viewer_3d` | false | false | IFC fixture, matching `web-ifc.wasm`, no production file | Disable; clear staged cache | Manual staging validation |
| `command_ui` | N/A | N/A | No presentation fallback or query/localStorage override | Do not reintroduce | Retired runtime flag |

Global enablement and per-user overrides remain administrator-managed database
state. Capture before/after values and never commit personal emails or user
overrides.

## Build and local preview procedure

Run from the exact candidate SHA with a clean dependency directory:

```powershell
npm ci
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm test
npm run build
npm run perf:bundle
npm run preview -- --host 127.0.0.1 --port 4173
```

Run the build twice from the same SHA and compare file lists, chunk names,
generated `public/wasm/web-ifc.wasm`, and hashes. Do not claim byte-for-byte
identity until compared. Vite copies the installed `web-ifc.wasm` at build
start. Source maps are disabled unless `SENTRY_AUTH_TOKEN` is present; when
uploaded, hidden maps are deleted from `dist`.

Local preview checks are non-destructive: `/`, `/manifest.json`, a deep-link
route, static asset loading, `/wasm/web-ifc.wasm`, and service-worker behavior
must be checked without signing into production. Missing browser-public
Supabase configuration must fail with the `EnvValidationError` contract.

## Promotion gates

Staging promotion requires all of the following evidence:

- Exact SHA and CI run for that SHA.
- Separate Vercel and Supabase staging targets confirmed.
- Migration preconditions/postconditions captured.
- Edge Function revisions, secrets, CORS, and health checks captured.
- Dedicated staging Auth users and isolated fixtures confirmed.
- Storage legacy-object assessment and policy verification completed for the
  current single-tenant candidate; the multi-tenant gate remains open.
- Smoke runbook results recorded, including blocked/clean/authorized fab release.
- Backup/restore rehearsal and frontend/Edge rollback receipts recorded.
- Product/legal owner approval recorded before any production consideration.

Batch 42 prepares these gates but does not execute staging deployment.

## Batch 43A read-only prerequisite audit

Batch 43A rechecked candidate `270b993ef35ec79517c635114321f4bdc8420760`
against the explicitly approved staging targets only. No production target,
production alias, production credential, migration, Edge Function deployment,
fixture mutation, upload, or repository-setting change was used.

- Vercel identity is verified as project `steelbuild-pro-staging`, project ID
  `prj_W0dhGzRfU3uQPkqxZLhnzwXTMQO8`, with the candidate SHA present in a READY
  staging deployment. The canonical staging URL returned HTTP 200.
- Supabase identity is verified as `SteelBuild-Pro Staging`, ref
  `abbeavtbifuddtrifvae`, URL `https://abbeavtbifuddtrifvae.supabase.co`, and
  status `ACTIVE_HEALTHY`.
- Backup readiness is **blocked**. The documented daily-backup/PITR mechanism
  and restore instructions exist, but no current staging timestamp, restore
  point, custom-format dump, checksum, retention record, or verified backup
  identifier was available through the authorized read-only tooling. Migrations
  must not be applied until the owner supplies that evidence.
- Staging migration history ends at `20260703191034_hard_erasure_rpcs`. The six
  approved Phase 0 migrations remain pending: the five sanitized submittal flag
  seeds and `20260712000000_seed_feature_flag_catalog.sql`. The `feature_flags`
  table and expected columns exist, but the read-only catalog query returned zero
  rows. Migration checksums were not available from the project metadata API.
- The candidate source contains `_shared` plus all eight manifest-listed Edge
  Function directories. Only `account-delete` is currently deployed in staging.
  No function was invoked or deployed. Secret presence could not be verified by
  name with the available tooling. Required names are documented in the handoff;
  values must remain in the Supabase secret store.
- The staging SQL catalog reports private `app-files` and `email-attachments`
  buckets and authenticated Storage object policies. Source upload paths use
  organization-scoped `<org_id>/uploads/...` keys. Cross-tenant denial and
  signed-URL behavior remain unverified because no staging users or files were
  created.
- The Vercel project and deployment are staging-only, but the deployed entry
  asset did not independently prove the embedded `VITE_SUPABASE_URL`. Owner
  verification of the staging Vercel environment variables is still required;
  no production URL was assumed.
- No staging accounts, organizations, projects, drawings, Submittals, RFI
  fixtures, or fabrication-release fixtures were created. The fixture plan
  remains Organization A/B, owner/admin, PM/editor, viewer, one project per org,
  clean and blocked fabrication cases, drawing upload, and Submittal round data.
- Existing `backup-dr.md` and `rollback.md` provide restore and rollback
  procedures, but no backup receipt or restore rehearsal evidence exists.

**Batch 43A decision: OWNER ACTION REQUIRED / BLOCKED.** Obtain a current,
restorable backup identifier for `abbeavtbifuddtrifvae`, verify the staging
Vercel environment values and Edge Function secret names, then rerun the
migration and deployment gates. Do not use production data or credentials.
