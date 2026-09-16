# Supabase drift repair — 2026-09-13

Target: Rev.2's production project `kjrwqagyeswwoxpjkcko`.

## Applied and verified

Two forward migrations were applied through Supabase's migration endpoint.
Their local filenames use the actual returned production ledger versions;
their complete SQL MD5 hashes match the stored statement payloads. No historical
ledger rows were inserted, removed or rewritten.

| Version | Repair | SQL MD5 |
|---|---|---|
| `20260913201853` | Drawing-set-aware pilot readiness; PM INSERT/UPDATE/DELETE floors on drawing impacts and email integration settings; daily-log column comment | `e30b074dd619aa1f2abec654d6f812fe` |
| `20260913201900` | Restrict direct execution of release implementation, GC drawing-count trigger and timeout probe; pin probe search path; add two reverse transmittal target indexes | `614936e8913b88a7b6bf8b5c3197a1de` |

The readiness defect affected 356 active actionable leaves with drawing-set
links but no legacy sheet link. Production now has the exact canonical
readiness body (`faeeed62ac7dc3946b971c19908ed3bd` MD5). The public release
wrapper retains authenticated execution. The implementation retains its newer
admin-only drawing-gate override and its source bytes; only direct client
execution was revoked. All six PM policy predicates and both indexes were
queried after application. No customer rows were changed by these migrations.

Security advisors no longer report anonymous SECURITY DEFINER execution or a
mutable function search path. Other existing notices remain; this is not a
claim that every advisory or authenticated workflow has been audited.

## Verification and rollback

- All 107 pre-repair active migrations replayed on an empty disposable local
  Supabase PostgreSQL 17.6 database.
- Independent source review verified both forward migrations and the exact
  recovered ledger archives.
- Readiness/permission SQL tests use synthetic users with the real auth and
  RBAC functions: set-only and missing links, nonmember denial, field write
  denial, and PM updates. Eight unexpected-state guards, idempotency, exact
  old-body rollback, and ACL/config preservation passed.
- `supabase/tests/drift_function_entrypoints.sql` replays the entrypoint
  repair against six database shapes, including the audited production ACLs.
  A catalog-wide before/after snapshot may change only the intended ACLs,
  probe settings and indexes. It also proves real role denial, idempotency,
  and that the guard rejects 13 kinds of unreviewed drift. Mutation testing
  killed 62 of 72 migration mutants; the rest are visible only in the file's
  bytes, so only a byte-level check of the applied migration can catch them.
- 6,013 Vitest tests across 636 files passed after a clean dependency install.
  Lint, four TypeScript gates and the no-new-JavaScript gate passed.

Manual rollback SQL lives outside the active directory in
`supabase/migrations_external/rollback_20260913201853_reconcile_verified_readiness_and_pm_floors.sql`
and `rollback_harden_drifted_function_entrypoints.sql`. Rollback intentionally
restores the audited old behavior/privileges; inspect current state and use
only for reversal of these specific repairs. Never automatically replay the
entire external archive.

## Remaining drift is still reported

The three previously unresolved ledger sources have been recovered verbatim
and classified with hashes in `supabase/migrations_external/provenance.json`.
That resolves missing source evidence, not all historical bookkeeping.

Thirty-six older required canonical versions remain absent from the ledger.
Comparison found most effects already present, applied under alternate stamps,
or superseded by newer definitions. Two important conflicts remain:

- `20260913084700_expense_atomic_creation` would replace the newer expense RPC
  and introduce a different bypass flag, status vocabulary and payload shape.
  Production validates project/org references and initial approval state; do
  not overwrite those checks or mark the old migration applied without an
  integrated expense workflow repair.
- The newer change-request policy explicitly allows FIELD creation while the
  older Rev.2 migration requires PM. The two intended authorities differ;
  the email-settings PM repair does not silently change that financial flow.

Other historical migrations contain data normalization, sequence updates,
organization preference changes, or older constraints. Zero outstanding
backfill rows prove current consistency, not execution of the historical SQL.
In particular, replaying the older piece-event CHECK would reject 356 existing
drawing-set event rows. The checker remains fail-closed; no blanket ignores,
false applied stamps, or gate weakening were introduced.

Five deprecated Edge Function versions have an independently reviewed,
backup-first manual retirement workflow. `stripe-webhook` remains held because
cached Stripe metadata lists enabled endpoints targeting it; current Stripe
status must be verified before retirement. The active `stripe-billing` is
protected. See the [ownership runbook](supabase-production-ownership.md) for
the workflow and backup-retention procedure.
