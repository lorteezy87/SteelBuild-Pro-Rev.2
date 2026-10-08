# Drawing-set governing gate check

Run `npm ci && npm test` in this directory. The harness loads the committed
`20261008013546_align_drawing_set_governing_submittal.sql` function into PGlite
with the minimum required tables and checks the actual return value for a
submitted round versus a newer draft, unknown approval handoff, exact set-ID
linking, a sheet hold, open and answered RFIs, a missing PDF, soft deletion, and
foreign-project denial.

The second check loads the lot-split wrapper candidate, then proves newly
split child lots inherit every set link from their parent, can be independently
unlinked afterward, and leave no partial child or link on failure. It also
checks that preexisting children are not automatically relinked and that a
stale cross-project parent relationship blocks the split atomically.

The third check loads `20261008022100_serialize_piece_drawing_set_links.sql`
and exercises the actual link, unlink, and atomic exclusive-replacement
functions. It checks project and target validation, the final link set,
idempotence, per-link audit events, and rollback when an audit write fails.
The existing link and unlink signatures, grants, and pinned search paths are
preserved. The new replacement RPC has the same `(project, piece, target set)`
arguments and returns the removed set IDs and mutation counts. The frontend
does not call it until the replacement workflow is migrated separately.

This is a local function-body regression check. PGlite does not exercise hosted
RLS policies, real authentication, concurrent writes, the full dependency
schema, or the existing `fab_release_blocking_rfis` implementation. A staging
rehearsal with real authenticated project fixtures is still required before
deploying this migration.

The fourth check executes `20261008023000_gc_issuance_shop_set_impact_links.sql`
and verifies exact GC issuance → shop-set IDs, same-project composite foreign
keys, PM-scoped RPC replacement, rollback for foreign/deleted/duplicate target
IDs, audit rows, and unchanged shop approval state. The new parent-table unique
indexes are FK prerequisites and can briefly block writes during transactional
creation; time that lock on staging. Hosted RLS/grants and two-session behavior
still require a staging rehearsal.

For the locking candidate, stage two independent authenticated PostgreSQL
sessions against one active leaf piece. In session A, begin a transaction and
call `split_piece_lot`, but hold the transaction open. In session B, call
`link_piece_drawing_set` or `replace_piece_drawing_set` for the same piece and
confirm it waits on the piece row. Commit A; B must then reject the now-split
parent without creating a parent-only link. Repeat in the opposite order:
begin the link or replace in A and hold it open, start the split in B, then
commit A. B must inherit the committed set links on every new child. Exercise
`unlink_piece_drawing_set` in the same ordering and inspect parent/child links
and `piece_events` before accepting a staging rollout. The PGlite harness is
single-connection and cannot establish these concurrent results.
