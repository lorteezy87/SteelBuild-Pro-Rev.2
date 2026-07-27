# Phase 0 Staging Smoke Test Runbook

Run only against the dedicated staging Vercel and Supabase projects. Mutation
cases require throwaway fixtures and an approved operator. Record test ID,
candidate SHA, actor, timestamp, evidence link, and result. Do not use a
production account, project, webhook, service key, or customer data.

| ID | Test and prerequisite | Steps | Expected evidence and rollback trigger |
| --- | --- | --- | --- |
| ST-01 | Authentication, MFA, recovery; dedicated staging users | Sign in, complete MFA if enabled, exercise recovery boundary, sign out/in | Correct session and tenant; rollback on auth/session leakage |
| ST-02 | Workspace/project selection; two staged scopes | Select workspace and project, refresh, open a deep link | Correct scope persists; rollback on cross-scope data |
| ST-03 | Cross-tenant isolation; two staging orgs if provisioned | Attempt direct URL/query access from org A to org B records | Denied/empty by RLS; hard stop on any data exposure |
| ST-04 | Roles; owner/admin/PM/viewer fixtures | Compare navigation, reads, and mutations by role | UI gates match server denial; rollback on unauthorized write |
| ST-05 | Drawing-set upload; isolated PDF/IFC fixture | Upload, wait for extraction, refresh register | Set and sheets appear once with correct identity; stop on duplicate/false success |
| ST-06 | Set-only upload state; fixture without extracted sheets | Upload and inspect incomplete state | Set remains visible and recoverable; stop on false completion |
| ST-07 | Submittal creation; staged project/SOV fixture | Create a submittal and refresh | Server-confirmed row, audit event, cache refresh; stop on false success |
| ST-08 | Audited send/return/verdict round | Move through an allowed round with authorized actor | Dates, BIC, round, and audit history are correct; stop on un-audited status |
| ST-09 | Revision behavior; existing revision fixture | Add/update a revision through supported flow | History is append-only/current revision correct; stop on overwrite |
| ST-10 | RFI creation/linkage; staged drawing | Create an RFI and link it to the staged drawing | RFI appears with project scope and link; stop on missing audit/scope |
| ST-11 | Open-RFI fabrication block; blocked fixture | Attempt release with an open blocker and no override | Release is denied fail-closed; stop immediately on success |
| ST-12 | Authorized override; PM/admin fixture and reason | Release blocked item with explicit authorized reason | Append-only override audit persists; stop if reason/actor is absent |
| ST-13 | Parent/subset distinction; lineage fixture | Release subset and inspect parent state | Parent does not falsely complete; stop on parent corruption |
| ST-14 | Fabrication Complete By; verify documented gap | Confirm whether the field exists and is authoritative | No false claim; record gap if absent; do not invent data |
| ST-15 | Schedule and Work Package linkage | Open schedule, update an isolated task/package if approved | Dates and links remain scoped; stop on stale/false success |
| ST-16 | Delivery workflow; isolated delivery | Create or update a staged delivery and refresh | Status, dates, cache, and audit are correct; stop on lost mutation |
| ST-17 | Change Order lifecycle; isolated change | Exercise allowed status/mutation path | Server confirmation and permission gate present; stop on unauthorized write |
| ST-18 | Expenses/financial permissions; role fixtures | Read and attempt permitted/denied financial actions | Owner/admin rules and Stripe test behavior hold; stop on cross-org data |
| ST-19 | Field workflow; mobile-sized browser | Open Field Hub, create isolated daily/inspection record if approved | Offline/read-only surfaces and sync state are clear; stop on false sync |
| ST-20 | Team invitation and role change; test email/account | Invite, accept with staging account, change role, verify access | Seat/role rules and audit are correct; stop on bypass or email leak |
| ST-21 | Export workflows; staged project only | Export a project and inspect file scope | Export contains only authorized staged data; stop on cross-tenant content |
| ST-22 | Error monitoring; known safe failure | Trigger a mockable/controlled failed request | User sees failure, Sentry receives redacted event, no secret/PII logged |
| ST-23 | Health endpoint; staging URL | Request health endpoint with documented headers | Healthy response identifies staging dependencies; rollback on failure |
| ST-24 | Refresh/deep-link routing | Open `/`, a project route, and a compatibility route directly; refresh | SPA fallback, redirects, and assets load; rollback on broken primary route |
| ST-25 | Service-worker update behavior | Load online, deploy a new staged build, reload online/offline | Navigation is network-first, hashed assets update, no stale shell pinning |

## Destructive test rules

`ST-01` through `ST-25` are staging-only. Account deletion, invitation
acceptance, status mutations, fab-release overrides, uploads, exports, and
provider calls are destructive or externally visible and require isolated
fixtures. `account_deletion` remains disabled for this candidate. No mutation
case may run against production.

## Current coverage classification

- Automated and blocking: Vitest auth, project scope, permission, Submittal,
  RFI, and fabrication-release safety tests in CI.
- Automated but nonblocking: authenticated Drawings/Submittals/RFIs rendering,
  unauthenticated protected-route rejection, and synthetic-user sign-out. The
  fab-release specs remain fixture-gated and require dedicated staging
  credentials.
- Staging manual: ST-01 through ST-25 until staging credentials and fixtures
  are provisioned and evidence is attached.
- Production post-deploy read-only: health, login, primary route, and asset
  checks only after a separately approved production deployment.
- Missing: full authenticated staging execution and accessibility audit across
  the critical workflows.
