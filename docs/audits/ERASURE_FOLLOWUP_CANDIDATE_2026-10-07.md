# Account-erasure follow-up candidate — 2026-10-07

Two forward migrations address failures found while validating the approved
staging release `1f475a4aaf2451b81456d8e3cb1cc2ecdad7a242`. The owner separately
approved their exact committed bytes at `44e04ea6d28016feccdfe33b97fb19141d657efa`.
Both were **applied and stamped only to staging at 09:20 UTC**, with full raw-blob
ledger hashes verified. The five original staging payloads are unchanged.
Account-delete v5 was deployed at 09:20:56 UTC with gateway JWT verification;
its seven source files match the original approved bundle. Actual account-delete
MFA/ownership denials, journal recovery and final synthetic cleanup passed.
The rehearsal history below explains the fixes; it is not production release
authorization. [Current staging acceptance](STAGING_ACCEPTANCE_2026-10-07.md).

| Forward migration | Exact file SHA-256 | Change |
| --- | --- | --- |
| `20261007084117_permit_authorship_cleanup_through_immutable_guards.sql` | `870c0bd5e93e6fc042971a49f1814fa0753d41fc0aa836ac92906fa34e3f8c3f` | Permit the Auth foreign-key author-to-NULL transition through four existing report/T&M trigger functions while preserving immutable content and financial history. |
| `20261007090057_acquire_erasure_relation_locks_before_rows.sql` | `6f26bbec42ca29e33accb246f38a3fa9ecbf34d1f0b10ec51eda9152015aeb2d` | Acquire the existing erasure chain's potential trigger-toggle relation locks before organization row locks, with atomic NOWAIT attempts and an eight-second acquisition budget. |

Both entries remain `required` / `PENDING PRODUCTION APPLY` in the ownership
manifest. Neither ledger is reclassified or repaired. Apply/stamp only an exact
committed payload in one transaction; verify its ledger payload hash. Never use
`db push`, migration repair, or automatic apply-time restamping.

## Failures and preserved boundaries

Normal staging triggers rejected `ON DELETE SET NULL` on an immutable generated
revision report. The authorship correction accepts only a non-null author
becoming NULL after that Auth parent disappears, with every other semantic field
unchanged. Before-row guards also require nested trigger execution. The queued
ticket rollup trigger skips financial side effects for that already-guarded
transition. Direct author clearing, reassignment, report edits, mixed financial
writes during the cascade, and ordinary immutable-state edits remain rejected.
There is no new callable helper, grant, or Auth-existence lookup endpoint.

The original erasure-first overlap returned HTTP 200 but was not successful
concurrency evidence: PostgreSQL logs confirmed `40P01` at
`2026-10-07T08:52:24.193Z` in `erasure_toggle_user_triggers`. Erasure held an
organization row and then requested a `SHARE ROW EXCLUSIVE` member-table lock;
the competing insert held `ROW EXCLUSIVE` on that table while waiting for the
organization row. The failed request was retried internally. The first erasure
delay ran again, producing the misleading 19.35-second final response.

The lock correction replaces only `erase_my_sole_member_workspaces(text)`.
Signature, ACL, security attributes, empty search path, 60-second PostgREST
timeout, and the original ownership/sole-membership/deletion/reason-check body
are preserved. Accounts with no owned workspace return before global locks.
Ownership and sole membership are read again after successful lock acquisition.

## Operational tradeoff

The candidate set is the existing erasure chain's **possible** ALTER targets:
public base tables with `project_id` except `projects`/`data_erasure_log`, plus
`projects` and the nine explicit organization-tail tables, in each case filtered
to enabled ordinary user triggers. It contained **104 relations** on staging.
Empty project tables must participate: a concurrent first insert can otherwise
introduce a later trigger-toggle target.

All locks are acquired alphabetically with NOWAIT inside one exception
subtransaction. A conflict releases the complete partial attempt before 50ms
backoff; after eight seconds the RPC fails atomically with `55P03/ERASURE_BUSY`.
The candidate set is checked again before row locks. Deployment DDL still needs
a quiet window; this does not guarantee arbitrary concurrent schema changes.

Existing trigger toggling already blocks writers across workspaces. This fix
takes those locks earlier and broadens each call from its nonempty census to
the potential set. It fixes the demonstrated inversion; it is not a scalable
concurrent-erasure redesign. Standalone project/organization/reset RPCs are
unchanged, and unrelated possible row-lock conflicts are outside this claim.

## Pre-application verification record

- Local account-deletion package passed: real Auth FK cascades through reports
  and six ticket-parent states; complete retained financial/report snapshots;
  forbidden direct and nested mixed writes; ordinary draft computation/events.
- Lock regression passed with real SQL/LOCK statements and catalog/ACL checks.
  With only lock-boundary and clock instrumentation it also passed partial
  attempt rollback, candidate-set replanning, 160 × 50ms deadline, changed
  membership/ownership, no-owner fast return, and atomic reason refusal.
  PGlite is single-session; these checks do not prove concurrent PostgreSQL.
- Manifest classification tests passed 22/22; scoped ESLint and diff checks
  passed. Root's app CI for preceding authorship commit `29a29a82` passed all
  unit/database/build gates; that earlier CI is not claimed as validation of
  the later lock migration. Existing full-dependency and production-drift
  failures remain visible.
- Root executed the complete hosted rollback payload with **both** forward
  fixes: SHA-256
  `221ee5599c17f36fabb54f292b8f099840a7df6425f24561973c25cbeda46aad`.
  It passed all account-erasure assertions and rolled back all fixtures.
  Post-checks found neither forward-fix marker in the permanent function
  bodies, with `session_replication_role=origin`.
- That payload expands repository test source plus exact migration blobs;
  source-test SHA-256 is
  `ec4b28e9b4535ba928427b79f02b9ec98d421441cb05e5574fb3fe198067740c`.
  It has one BEGIN, one ROLLBACK, and no COMMIT. Replica mode is restricted to
  synthetic historical authored-row setup; all erasure assertions run with
  normal triggers enabled.
- Independent review verified the temporary staging clone changes only the
  qualified function name. Exact candidate-function SHA-256:
  `443578c1e83343521eb72079d40c477a6d5304359260fc6b534f20f68e999855`.
  Its public wrapper is restricted to the disposable staging identity and
  transactionally rejects an unexpected erased scope. Private sequences count
  delay entries across rollbacks to expose hidden retries. Harness self-tests
  reject missing/late overlap phases, fast false passes, errors and repeat
  entries. All four actual hosted overlap cases also passed as recorded below.

## Hosted overlap acceptance and cleanup

The exact private candidate clone passed four real overlapping HTTP cases on
staging with normal triggers. Safe evidence is retained in
`work/staging-release/retry-http-{membership-first,creation-first,project-first,erasure-first}-result.json`.
Each record identifies candidate-function SHA-256
`443578c1e83343521eb72079d40c477a6d5304359260fc6b534f20f68e999855`.

| Concurrent case | Erasure HTTP elapsed | Writer HTTP elapsed | Result |
| --- | --- | --- | --- |
| Membership first | 5,947ms | 6,120ms | Membership committed; erasure returned empty and retained the shared workspace. |
| Normal organization creation first | 5,917ms | 6,151ms | Organization and owner membership committed; erasure retained the shared workspace. |
| Project insertion first | 5,975ms | 6,150ms | Exact project committed with normal triggers; erasure retained the shared workspace. |
| Erasure first | 9,307ms | 9,148ms | Only the exact disposable workspace and its two projects were erased. The membership insert waited 9,028ms in SQL and was rejected with `23503`; its control RPC returned that expected result. |

The final erasure completed beyond the ordinary eight-second role limit and
within the unchanged 60-second RPC timeout. All four rollback-surviving
phase-entry counters finished at exactly one; no repeated delay entry was
observed. Root's safe PostgreSQL log review for
`2026-10-07 09:09:35–09:12:10 UTC` found no `40P01`, `57014`, or `55P03` error
entries. These checks address the earlier misleading HTTP-success result.

After all requests settled, root ran the exact `49_retry_cleanup.sql` package
and verified that the disposable workspace and its two projects were gone,
no orphan memberships remained, all three validation Auth users survived, and
the temporary RPCs/schema were absent. At that rehearsal checkpoint, the
application RPC remained unchanged and neither forward migration had a ledger
stamp. The original deleted workspace's journal/Storage object was reserved
for the later account-delete acceptance; v5 subsequently recovered and removed
it, and all three Auth users and remaining exact fixtures were cleaned up.

## Applied staging follow-up and remaining holds

The exact `44e04ea6` application job passed in
[run 37599017686, job 112718815317](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37599017686/job/112718815317),
alongside secret scan and Edge typecheck. Both reviewed migration transactions
were applied to `ndyfjffsulfbwpmwdmic` and their full committed SQL ledger hashes
matched. The already-approved account-delete v5 deployment then passed 66
assertions across five actual HTTP phases, including journal recovery and
preservation of the other workspace during nonowner cleanup. Final privileged
fixture-absence checks and MFA readiness passed; the Realtime publication was
restored to its original zero-table baseline.

Production remains unchanged and requires separate authorization. The five high
development-dependency findings, billing/read-service configuration, native
release and operational acceptance remain open. Neither frontend Worker was
deployed by this backend release. The relation-lock operational tradeoff above
remains applicable after the demonstrated deadlock correction.
