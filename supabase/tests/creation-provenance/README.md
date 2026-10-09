# Creation limits and submittal provenance SQL verification

This package executes the actual candidate migrations in an isolated in-memory PostgreSQL engine (PGlite 0.5.8). It never connects to Supabase or reads application credentials.

From the repository root:

```sh
npm ci --ignore-scripts --prefix supabase/tests/creation-provenance
npm test --prefix supabase/tests/creation-provenance
npm test --prefix supabase/tests/creation-provenance -- --before-fix
```

The final command intentionally exits nonzero: 15 cases reproduce pre-fix bypasses. The fixed candidates pass 41 checks. The fixture loads actual baseline table definitions, creation RPCs, billing protection, project-access/role helpers, and the retained production capture of the submittal functions. It applies the current-membership role candidate first. Table grants, selected RLS policies and relevant foreign keys are installed explicitly; unrelated tables, triggers and hosted configuration are outside this fixture.

## Candidate behavior

- `20261008201934_enforce_authoritative_project_creation_caps.sql` closes direct client organization/project INSERT, preserving `create_organization` and `create_project` as atomic owner-bootstrap paths. It introduces no limit on how many workspaces a user can create. Organization creation still gets the database's free-plan default; client UPDATE cannot alter billing, and service billing updates still work.
- The project-table trigger applies the existing `plan_project_limit`: free 1 active project, pro 10, other plans unchanged. It protects privileged INSERT, batch INSERT, archived-to-active restoration, and destination-organization moves. Archival does not consume capacity; ordinary edits remain possible after a downgrade puts an organization above its cap.
- Creation locks the destination organization while reading its plan, then writes a private per-organization revision before counting active projects. Writing a shared row is deliberate: a stale repeatable-read/serializable contender must fail serialization rather than reuse an old count. Under read committed, the volatile trigger's subsequent SQL statement gets the committed count. A failed project/owner write rolls back the quota revision with it. No counters are trusted instead of the actual project rows.
- `20261008201944_bind_submittal_event_provenance.sql` locks and derives the actual submittal parent project, rejects mismatched/missing/archived parents, requires current project access and PM-or-higher permission, and stamps the real `auth.uid()`. Anonymous callers, viewers, field users and removed workspace members are denied. Direct client activity-table writes are revoked.
- The same captured `transmit_submittal_round`, `record_submittal_response` and `attach_revision_to_submittal_round` implementations run through the fixed logger and append three correctly scoped events. This is still a PM-authored event API: permission to log an event is not independent proof that the described business transition occurred.

## Required release validation

These are unapplied candidates. Review and apply/stamp their exact filenames manually under the repository's shared-database policy. Never use `supabase db push`, migration repair or MCP `apply_migration`. Confirm the current-membership role migration (`20261008032524`) is present first. No hosted catalog, schema, deployment, advisor or sibling-app behavior was changed or freshly verified by this package.

Before release, compare the target schema/functions/grants with the fixture assumptions, run advisors, and replay these allow/deny cases with real anonymous, authenticated PM/viewer and service credentials against a disposable staging organization. Confirm sibling clients use the atomic creation RPCs; direct REST creation is intentionally unavailable. Preserve legitimate billing-service plan updates.

PGlite is single-session. The revision/rollback checks exercise the actual serialization writes, but **do not claim multi-connection concurrency proof**. On a disposable PostgreSQL staging database, start two sessions at a one-slot boundary, hold the first transaction open after INSERT, and attempt RPC/privileged INSERT, reactivation and organization-move combinations from the second. Commit the first; the second must reject the cap (read committed) or fail serialization (repeatable read/serializable). Confirm no second active project or orphan owner/quota row is committed. Also exercise billing downgrade while creation holds the organization lock. Handle transient serialization/deadlock errors by retrying the complete transaction, never by bypassing the trigger.

Privileged project upserts at capacity should use an explicit UPDATE for an existing project: PostgreSQL runs BEFORE INSERT triggers before resolving ON CONFLICT, so an insert-shaped request can correctly fail the admission check even when the caller intended only an edit. The shipped client creation path does not upsert projects.

References checked 2026-10-08: [Supabase row security and grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html), and the [Supabase changelog](https://supabase.com/changelog). The September PostgreSQL minor-version notice concerns extensions/operators; these candidates add none of those features.
