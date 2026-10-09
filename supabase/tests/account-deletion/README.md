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

## Relation-lock ordering

Staging overlapping HTTP requests exposed a real `40P01` deadlock: erasure held
an organization row while a membership insert held the member relation's
`ROW EXCLUSIVE` lock. The insert's normal guard waited for the organization;
erasure's later `ALTER TABLE ... DISABLE TRIGGER` needed the relation's
`SHARE ROW EXCLUSIVE` lock. A final HTTP 200 was insufficient evidence because
the database client retried the deadlock victim. The approved original migration
is unchanged; `20261007090057` replaces only the account-erasure RPC.

The forward fix takes every potential trigger-toggle relation lock before any
row locks. The set is the existing project erasure's public base tables with
`project_id` (excluding `projects` and `data_erasure_log`), plus `projects` and
the organization erasure's nine explicit tail tables. Every candidate must have
an enabled ordinary user trigger, matching `erasure_toggle_user_triggers`.
Empty project tables are included because a concurrent first insert can change
the later census. On staging this set contained 104 relations on 2026-10-07.

Each alphabetically ordered acquisition attempt uses `NOWAIT` inside one
exception subtransaction. A conflict rolls back the whole partial set before
50ms backoff. Acquisition stops after eight seconds with `55P03/ERASURE_BUSY`;
the whole RPC retains its existing 60-second timeout and original grants.
Accounts with no owned workspace return before acquiring these global locks.
Ownership and sole membership are read again after successful acquisition.
The candidate set is rechecked before row locks; deployment DDL still requires
a quiet window because this does not guarantee safety against arbitrary schema
changes after that final catalog read.

This deliberately broadens each call from its nonempty census to the possible
ALTER set and takes locks earlier. The existing trigger-toggle erasure already
blocks writes to those relations across all workspaces. The fix closes that
lock-order inversion; it is not an efficient concurrent erasure architecture.
Do not generalize its guarantee to every possible row-lock conflict or to
standalone `hard_delete_project`, `hard_delete_organization`, or `reset_org_data`
calls, whose implementations are unchanged.

`verify-lock-order.mjs` executes the real SQL and catalog/ACL checks. With only
the lock boundary and clock instrumented, it deterministically checks partial
attempt rollback, the eight-second deadline, changed membership/ownership,
the no-owner fast path, and archival rollback after reason refusal. PGlite is
single-session: hosted overlapping requests remain required to establish real
lock release and writer progress. Test membership-first, erasure-first, normal
organization creation, and project insertion with normal triggers. Record
phase entry counts and safe database log SQLSTATEs to reject hidden retries or
deadlocks; do not accept a final successful HTTP response alone.

## Deployment checks

1. Land the two base migrations and both forward fixes before manually applying
   and stamping their exact committed payloads as `20260927150000`,
   `20260927160000`, `20261007084117`, and `20261007090057`, in that order.
   Verify the ledger payload hashes. Do not use `db push` or an automatic
   apply-time stamp.
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
