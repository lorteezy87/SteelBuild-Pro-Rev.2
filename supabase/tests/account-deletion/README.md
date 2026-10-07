# Account deletion authorization and timeout regression

```sh
npm ci --prefix supabase/tests/account-deletion
npm test --prefix supabase/tests/account-deletion
```

The isolated PGlite database runs the shipped authorization helpers and both
account-deletion migrations. It verifies that a current project admin can
read an archived project's census, that the same admin loses access after
workspace removal even when `user_projects` remains, and that workspace
owners retain the census access needed for erasure. It also checks the RPC
catalog setting PostgREST consumes before executing a request.

This check does not run the complete production erasure chain. Run
`supabase/tests/account_deletion_erasure.sql` on staging with its production
schema to cover authorship, archival rollback, and shared-workspace isolation.
That script rolls back its fixtures and migrations.

The authorship regression also loads complete live row shapes and the original
immutability/financial triggers captured from staging on 2026-10-07. It first
reproduces the failing Auth foreign-key cascade, then applies the forward fix
`20261007084117`. Real account deletion must clear report/ticket authors without
changing any other semantic report or financial field, recalculate no ticket
amounts, and append no financial events. Draft, pending, approved, collected,
void, and rejected ticket parents are covered. Direct clearing/reassignment,
content edits, and mixed writes injected during the real cascade remain
rejected; a normal draft ticket edit still recalculates and logs its event.

The hosted script uses replica mode only for synthetic authored-row creation
(not Auth, workspace, or project setup), restores origin before all seven
original assertion groups, and checks trigger enablement before and after
erasure. The immutable report and frozen financial snapshots must survive the
real Auth delete. Apply the forward fix before releasing the account-delete
function; its four existing trigger functions expose no new callable helper.

## Deployment checks

1. Land the two migration files before manually applying and stamping the exact
   committed payloads as `20260927150000` and `20260927160000`. Verify the ledger
   payload hashes. Do not use `db push` or an automatic apply-time stamp.
2. The timeout belongs in the function declaration (`proconfig`), not a
   `SET LOCAL` statement in the function body. PostgREST 14 hoists configured
   function settings before the main query; production reported PostgREST 14.5
   on 2026-10-05. Its default `db-hoisted-tx-settings` includes
   `statement_timeout`. The migration reloads the schema cache so the REST API
sees this declaration. No global or role timeout is changed.
3. Before deploying the Edge Function, prove the REST path on staging: use a
   disposable owner/account with multiple sole-member workspaces and enough
   data for the atomic RPC to take longer than eight seconds. Call it using
   that user's JWT through `/rest/v1/rpc/erase_my_sole_member_workspaces`, and
   verify the response completes within 60 seconds with only the expected
   workspaces erased. Test an ordinary RPC still times out at the normal role
   limit. Direct SQL invocation does not prove PostgREST hoisting.
4. In two staging sessions, hold an organization membership change open while
   the owner invokes the erasure RPC. The erasure must wait for the parent-org
   lock and then skip the newly shared workspace. Reverse the order: once
   erasure holds the lock, the membership insert must not create a surviving
   membership in an erased workspace.
5. A workspace exceeding the REST API's 60-second limit still rolls back. Do
   not disable the timeout or split a user's erase into partially committed
   requests. Such accounts require a separately reviewed job/maintenance
   connection before claiming unrestricted deletion capacity.

Storage cleanup and Auth Admin deletion happen after the workspace database
transaction. A later Storage/Auth failure is not rolled back by this RPC.
Storage cleanup enumerates every directory page before removing objects and
checks that the prefix is empty afterward. Listing/removal errors produce
`STORAGE_ERASURE_FAILED` and retain Auth users rather than returning success.
Every account-deletion attempt pages the caller's organization records in the
existing append-only `data_erasure_log` and recovers the org ID plus the complete
`row_counts.per_project` census. That journal is written by the authorized
caller-scoped erasure RPC in the same transaction as the deletes; client-editable
metadata is never accepted as cleanup authority. A retry therefore still purges
files after the RPC returns empty fresh IDs. Fresh erasures must be present in
the journal, and recovered org/project IDs must remain absent before any purge.
Missing/failed reads, incomplete journal records, or a recreated ID stop deletion
with `ACCOUNT_CLEANUP_INCOMPLETE` and keep the account. Historical malformed
journal records require support review; they are never treated as completed.

Workspace mode also requires complete paginated project/member snapshots before
its RPC. It purges the RPC's durable project census, then requires an explicit
successful zero-membership count before deleting an orphaned Auth user. It
reports a failure if any count or Auth deletion fails. A failed workspace-mode
request cannot be replayed through the deleted org's ownership lookup; its owner
can recover file cleanup through account mode, or support can finish from the
journal. The journal does not contain a durable member-ID roster for retrying
other users' workspace-mode Auth cleanup.

The mocked handler regression runs the actual two-attempt account flow: the
first attempt commits database erasure but fails file removal; the second gets
empty RPC IDs, recovers the journal, removes all files, and only then deletes
Auth. It also covers more than one journal page, wrong-caller isolation,
incomplete census and live-ID refusal, and unknown membership/snapshot reads.
Run these tests without any live Supabase connection:

```sh
npx vitest run supabase/functions/account-delete/__tests__
```

References:

- [PostgREST 14 transaction settings](https://docs.postgrest.org/en/v14/references/transactions.html#hoisted-function-settings)
- [PostgREST hoisted settings configuration](https://docs.postgrest.org/en/v14/references/configuration.html#db-hoisted-tx-settings)
- [Supabase timeouts](https://supabase.com/docs/guides/database/postgres/timeouts)
