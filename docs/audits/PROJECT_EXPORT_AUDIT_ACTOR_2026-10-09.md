# Project export audit attribution — 2026-10-09

Source correction only. No migration, grant, trigger, policy, hosted export retry,
historical audit rewrite, or deployment is part of this change.

## Confirmed staging defect

The protected backend acceptance run `37956141828` exercised candidate
`32cf2c50a6eb603bc213868de4ffc54c7f196601`. Its single authorized export returned
HTTP 200 and passed scoped v2/credential-exclusion validation: 96 tables, 155
rows, one file reference and one Storage inventory entry. The runner then failed
at `stage=audit`, correctly withholding an acceptance claim.

Read-only inspection of staging `ndyfjffsulfbwpmwdmic` found the corresponding
activity `14550050-9160-4f35-894a-e66b04a5a6df`, timestamp
`2026-10-09 16:02:39.44+00`. Its project/entity IDs matched, its type/action were
`Project`/`exported`, and metadata matched v2/96/155/1. However,
`performed_by_user_id` was NULL. This is an actor-attribution defect, not a missing
audit row or an export-envelope failure.

Installed catalog definitions matched the committed
`20260702035058_audit_attribution_hardening.sql`: `trg_activities_actor` runs
`activities_stamp_actor()` BEFORE INSERT, unconditionally replacing the supplied
actor with `auth.uid()`. The old Edge handler used a service-role client without
the caller's subject, so the trigger erased the correctly supplied user ID.
The insert succeeded and the handler never read the persisted actor back.

Installed `activities` policies were `project_insert` and `project_select`, both
for `authenticated`, both using `user_has_project_access(project_id)` as their
INSERT check or SELECT predicate. No UPDATE/DELETE policies were present.

## Correction

The Edge handler uses its existing anon-key + verified caller-JWT client for the
mandatory audit insert, requests only `id,performed_by_user_id`, and requires a
valid UUID ID and an exact actor match before returning the export. An insert
error, unavailable row, malformed ID, NULL actor or wrong actor returns the
existing generic audit failure without the export contents. RLS checks current
project access again at the final write. The service-role key/client is removed
from this handler because it had no other use.

The database trigger remains the authority for actor attribution and ignores
forged input. Existing authenticated activity INSERT permission is unchanged;
this change does not make arbitrary activity rows proof that an Edge export
occurred. The handler still requires its own successful attributed audit before
returning. The acceptance runner retains its exact actor/project/metadata checks.
Historical NULL-actor rows are preserved unchanged.

## Verification and remaining release evidence

- The unchanged handler reproduced **9 failing / 1 passing** regression cases:
  it used the service client and returned success for missing/wrong audit actors.
- After correction, **28 focused tests** passed across the actual-entrypoint,
  export-v2, pagination and all-seven enrolled-MFA denial suites. Entry-point
  tests keep Auth verification live in the compiled source body while replacing
  only external I/O; they verify the caller Authorization header reaches the DB
  client, a body-supplied actor is ignored, and no service client is constructed.
- **8 in-memory PostgreSQL-engine checks** load the shipped activities schema,
  actor trigger, actual INSERT/SELECT policies and current project-access
  resolver. They reproduce the old service-role NULL actor, prove caller actor
  stamping and anti-spoofing, deny foreign/archived/missing-identity requests,
  deny an audit after workspace membership is removed following a visible
  project read, and retain append-only behavior.
- The existing **36 membership SQL checks** also pass. The new SQL suite runs
  through that package's existing required CI command with no new dependency or
  workflow. The fixture substitutes Auth request-claim accessors and UUID
  generation locally; it is not hosted PostgREST/deployment evidence.

Scoped lint and strict test/fixture TypeScript checks are part of the source
verification. Hosted CI must still check the exact final source SHA, including
the real Deno entrypoint. A reviewed staging redeploy and the bounded acceptance
runner must confirm one correctly attributed new activity before this defect is
called fixed in staging. No such retry was performed while authoring this change.
