# Project subscription capacity: candidate and evidence

## Finding

Read-only inspection of production on 2026-10-09 confirmed authenticated `projects` INSERT is granted and its only INSERT policy checks workspace membership. The live `create_project(jsonb)` function alone counted active projects, without locking the parent organization. A client could bypass the Free/Pro cap through direct inserts, and concurrent RPC creates could both pass the count.

The committed-main catalog and live `plan_limits` agree: Free allows one active project, Pro ten, Business and Enterprise unlimited. NULL `is_deleted` counts as active. Those rules are preserved.

## Candidate boundary

`supabase/migrations/20261009140000_enforce_project_plan_limits.sql` adds a table trigger for active admission through INSERT, restoration or privileged workspace reassignment. It serializes on the target organization, rechecks authenticated workspace membership after waiting, checks admin authority for authenticated restores, and counts active rows after the lock. The existing live creation payload and creator/admin assignment are retained; its early quota read now also acquires the parent lock.

PostgreSQL locks a project row before an UPDATE row trigger. Restores therefore take the organization lock with NOWAIT and return retryable `55P03` when busy, avoiding a project-to-organization wait against parent-first erasure. Existing active projects remain editable/archivable after downgrade. Every service-role and maintenance admission still obeys the cap. No caller-controlled setting bypasses it.

There is no new restore API or relaxation of archived-project RLS. Restoration tests exercise the guard through privileged writes, retaining authenticated claims where checking an acting user's authority. Restoring a parent row alone is not an application-level restoration of archived children.

## Verification

Before the candidate, the dedicated regression using captured live functions and direct authenticated INSERT failed with `Missing expected rejection`. With the candidate, 18 focused PGlite behavior checks pass. Exact candidate SHA-256 `c79db36e74eda4bac62f1b1921022e8e0af9dd7977153023c443ce4e86b0cdae` also passed 18 installed-schema staging rollback assertions against `ndyfjffsulfbwpmwdmic`, with actual Auth, RLS, project setup and soft-archive triggers. After rollback the candidate and ledger were absent and synthetic users, organizations and projects were all zero. Independent PostgreSQL concurrency remains pending.

The first hosted fixture tried inserting a project already archived, which live setup numbering correctly rejects. The rehearsal now creates the project active and calls the installed `soft_delete_project` before testing privileged restoration. No production change was needed for that fixture correction. The first CI PostgreSQL run found an existing non-BYPASSRLS `service_role` from another disposable suite; the fixture now explicitly mirrors hosted service-role RLS semantics before running behavior tests. Hosted SQL and policies were not modified to work around either fixture issue.

The dedicated suite includes Free/Pro/unknown/unlimited boundaries, direct REST-equivalent writes, ordinary RPC payload/assignments, explicit service/maintenance admissions, privileged restore authorization, multirow atomic rollback, NULL active state, and continued editing of existing over-limit projects. CI owns the full app suite/build and real PostgreSQL checks; broad local app checks are avoided after the host crash.

## Rollback and release

This is additive enforcement with no data rewrite. Release only after reviewed exact-source staging acceptance. Do not apply or stamp from the fixture runner. Rehearsal must wrap the exact migration and synthetic tests in one transaction ending in ROLLBACK, then verify candidate, ledger and synthetic rows are absent.

Emergency source rollback would drop only `trg_enforce_project_plan_limit` and `enforce_project_plan_limit()` and restore the captured prior `create_project` definition. That reopens the quota defect and requires a reviewed operational decision. A rollout must preserve the five deployment gates and committed-file/ledger hash contract.

## Separate monetization gaps (not changed here)

The client advertises Pro module differentiation, while current committed/runtime server checks authorize pay applications and Piece Control by project role/readiness rather than paid plan. Trade operations modes such as erection-only are absent from committed code and live organization/project schema; `piece_control_mode` is a rollout stage. A separate customer-state and plan-policy review must define enforcement consistently across REST/RPC, Edge Functions, imports, offline writes, exports and background jobs.

Invitation capacity counts members plus pending invitations, but its trigger runs only before INSERT and has no parent lock; concurrent inserts or canceled-to-pending updates can overbook pending seats. Actual accepted membership is independently serialized by the existing membership trigger, so this is not a demonstrated accepted-member cap bypass.

The current LLM quota reads previously recorded per-user telemetry before dispatch and logs usage best-effort afterward. It explicitly is not an atomic spend reservation, and unset limits disable both dimensions. Project ID is optional and no workspace/plan entitlement is consulted when it is absent. Atomic reservations and scoped paid AI budgets need a separate source slice; hosted secret values have not been inspected or assumed here.
