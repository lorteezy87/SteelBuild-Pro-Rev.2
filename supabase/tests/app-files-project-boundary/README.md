# Additive project file reservations — disposable verification

The uninstalled SQL is `supabase/candidates/app-file-upload-reservations.sql`.
It is deliberately outside the migration glob. These tests never connect to
Supabase and do not change existing Storage policies or file bytes.

Run the isolated behavioral suite:

```powershell
npm ci --prefix supabase/tests/app-files-project-boundary --ignore-scripts
npm test --prefix supabase/tests/app-files-project-boundary
```

`APP_FILE_RESERVATION_REPRO=1` skips the candidate and reproduces the absent
authorized-reservation API. The first success assertion fails for that reason.

Real PostgreSQL runs only with `APP_FILE_POSTGRES_TEST=1` and a loopback URL whose
database name is exactly `steelbuild_app_file_reservations_test`; query-string
connection overrides and populated databases are rejected. The CI service is
disposable PostgreSQL 17, with no hosted credentials. `APP_FILE_POSTGRES_CREATE_DB=1`
creates the named empty database, then the runner applies its fixture/candidate.

```powershell
npm run test:postgres --prefix supabase/tests/app-files-project-boundary
```

The fixture uses current membership-role and MFA helpers from committed source,
plus the membership guard that serializes changes at the organization row.
It reproduces the baseline public default grants and deliberately adds broader
global grants so private table/helper revocation cannot pass vacuously.
`service_role` has BYPASSRLS. RLS alone is not used to deny that role.

Behavior checks cover fresh and repeated requests, exact project/org matching,
unassigned/viewer/field/PM/admin roles, explicit versus default role precedence,
enrolled MFA, blocked nonproject scopes, untrusted workflow/extension/path input,
cross-actor isolation, removal/archive/downgrade retry denial, monotone floors,
Auth anonymization, project FK behavior, and existing policy/object preservation.
Concurrent tests use separate backend PIDs and observe actual lock waits;
same-session calls are not reported as concurrency evidence.

Verified source `b6c99b4659a18b6ccd44c5572a86739d2f63e322` passes 39 behavioral
checks in each engine and 16 concurrent PostgreSQL scenarios. The Auth-erasure
case includes the actual membership trigger: a held Auth user row must return
`FILE_RESERVATION_BUSY` / `55P03` immediately, so the reservation does not wait
organization-to-user against the erasure's user-to-organization lock order.
Other cases prove same-request serialization, conflicting payload denial, and
fresh authorization after parent and receipt-row waits. See the
[source evidence](../../../docs/audits/APP_FILE_RESERVATIONS_SOURCE_2026-10-09.md)
for the exact CI job and SQL checksum.

The RPC requires `{kind:'project',orgId,projectId}` and a named upload profile.
It returns only `{request_id,bucket,path}`. Receipt metadata is private, exact
actor/request payload reuse is stable, and a changed payload is refused. An
existing receipt is not a permission bypass: every retry rechecks current
workspace/project access, role floor and enrolled MFA.

This source foundation does **not** make existing uploads project-scoped. There
is no policy cutover, legacy backfill, entity attachment/adoption endpoint,
browser uploader integration, MIME/byte inspection, orphan cleanup, receipt
retention policy, or hosted acceptance here. The later candidate must implement
those contracts, recheck the unclassified inventory, and preserve captured PDFs.
