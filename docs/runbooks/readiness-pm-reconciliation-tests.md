# Readiness and PM-floor reconciliation: local PostgreSQL tests

These checks use the existing local Supabase container
`supabase_db_drift-replay`, whose `postgres` database has the full canonical
schema replay. They use real `auth.uid()`, organization/project membership and
RBAC functions. No authorization functions are mocked.

Run commands from the repository root. Requirements: Docker, the populated
disposable container, and Node 22.18+ for native TypeScript execution. The local
`supabase_admin` database role is needed for schema copying and synthetic fixture
setup; the restricted `postgres` role cannot restore all Supabase-owned objects
or function settings. No production credentials or connections are used.

## Acceptance on the full canonical database

```bash
docker exec -i supabase_db_drift-replay \
  psql -X -q -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/reconcile_verified_readiness_and_pm_floors.sql
```

The SQL begins a transaction and creates synthetic users, memberships, project,
piece and drawing records. It briefly suppresses triggers only while installing
fixtures, then restores normal trigger execution before the assertions. The
assertions run as `authenticated` with actual field, PM and nonmember identities.
The final `ROLLBACK` removes all fixtures; on failure, `ON_ERROR_STOP` closes the
connection and PostgreSQL rolls back the open transaction.

Expected output:

```text
PASS: set-only and missing links, real member/nonmember authorization, field write denial, PM write acceptance
```

This verifies drawing-set-only versus missing links, nonmember readiness denial,
field INSERT/UPDATE/DELETE denial on both target tables, and PM UPDATE acceptance.
It does not invoke a destructive business RPC or prove PM INSERT/DELETE behavior.

## Reproduce the isolated migration/rollback runner

The runner deliberately targets only database `drift_july_guard_test` in that
same local container. Create it from the **complete schema** of the canonical
`postgres` database; the clone includes real functions, constraints, triggers,
policies and grants. `--schema-only` copies no data. Publications/subscriptions
are omitted because these checks do not exercise realtime replication.

Create the database once:

```bash
docker exec supabase_db_drift-replay \
  createdb -U supabase_admin drift_july_guard_test
docker exec supabase_db_drift-replay bash -o pipefail -c \
  'pg_dump -U supabase_admin -d postgres --schema-only --no-publications --no-subscriptions | psql -X -q -U supabase_admin -d drift_july_guard_test -v ON_ERROR_STOP=1'
```

If that named test database already exists, reuse it or deliberately recreate
only it before the two commands above:

```bash
docker exec supabase_db_drift-replay \
  dropdb -U supabase_admin drift_july_guard_test
```

Do not drop or replace the source `postgres` database. Wait for the schema-copy
command to exit successfully before running the test:

```bash
node scripts/test-readiness-pm-reconciliation.ts
```

No uncommitted baseline file is needed. Starting from the canonical desired
state, the runner uses the checked-in manual rollback to reconstruct the exact
audited old state, including its CRLF function body, reproduces the old readiness
failure, and applies the checked-in forward migration again. The caller owns
the forward transaction, just as the migration/ledger runner does.

The JSON result must report `"result": "passed"`. It checks:

- Desired-state idempotency and unchanged ACL, owner and security settings.
- Eight fail-closed preconditions: changed function body/config, policy
  predicate/role, missing policy, disabled RLS, changed column type/comment.
- Complete transaction rollback after every rejected precondition.
- Exact old-body rollback MD5 and forward/rollback/forward equivalence.
- The real-RBAC SQL acceptance checks above.

The isolated database ends in the desired repaired state. The source `postgres`
database is not modified by this runner. The scripts accept no remote database
URL or project identifier.

## Recorded verification

On 2026-09-13 the SQL acceptance passed unchanged against the full canonical
`postgres` database after 107 baseline migrations. A newly recreated full-schema
clone also passed the complete TypeScript runner. The tested active migration is
`20260913201853_reconcile_verified_readiness_and_pm_floors.sql`; the matching
rollback is under `supabase/migrations_external/`. These are local PostgreSQL
checks, separate from production application and live post-application verification.
