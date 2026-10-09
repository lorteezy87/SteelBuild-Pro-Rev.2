# Project subscription capacity acceptance

This directory tests `20261009140000_enforce_project_plan_limits.sql` without application credentials. `npm test --prefix supabase/tests/project-plan-limits` uses disposable in-memory PostgreSQL/PGlite. The fixture retains read-only captured production `create_project`, plan and authorization functions; the hosted rehearsal uses all installed policies and triggers.

Set `PROJECT_LIMIT_REPRO=1` to skip the candidate and demonstrate the original direct-insert regression: the expected quota rejection is missing. This is an intentionally failing repro.

The independent-session PostgreSQL runner requires all of:

- `PROJECT_LIMIT_POSTGRES_TEST=1`
- `PROJECT_LIMIT_POSTGRES_URL=postgresql://<disposable-user>:<disposable-password>@127.0.0.1:5432/steelbuild_project_limits_test`
- An empty database, or `PROJECT_LIMIT_POSTGRES_CREATE_DB=1` to create it.

Run `npm run test:postgres --prefix supabase/tests/project-plan-limits`. The runner refuses non-loopback hosts, alternate database names, query overrides and populated databases. CI runs it in the existing disposable PostgreSQL 17 service.

Only the org whose capacity changes is serialized. Restorations already hold a project row, so parent lock contention returns `55P03`/`PROJECT_PLAN_BUSY` for retry; they never wait in reverse order against erasure. Authenticated membership/admin checks are repeated at admission. Service-role and maintenance callers obey the same capacity; there is no caller-settable bypass.

Active admissions require READ COMMITTED, the normal PostgREST transaction mode. A pinned REPEATABLE READ snapshot cannot observe another admission merely because it obtained the parent lock; other isolation levels therefore receive retryable `40001`/`PROJECT_PLAN_ISOLATION` before admission. Retry the operation in READ COMMITTED. Existing edits and archives are unaffected.

This change does not add a restore API, alter plan sizes, remove over-limit existing projects, or introduce paid-module/trade-mode restrictions. Hosted application and ledger stamping remain separate release steps.

`node supabase/tests/project-plan-limits/hosted-rollback.ts` prints a JSON object containing the exact candidate hash and a single transaction for explicitly selected staging rehearsal. It never connects. The transaction uses existing Auth/RLS/setup/archive triggers, ends in ROLLBACK and confirms zero remaining synthetic fixtures. Never execute it against production.
