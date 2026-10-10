# Backend rehearsal evidence — 2026-10-05

No production SQL was applied and no migration ledger rows were inserted. This
document records verification, not deployment approval or a completed release.

## Revision retry RPC — verified on staging

Target: persistent staging project `ndyfjffsulfbwpmwdmic`; production metadata
was read only from `kjrwqagyeswwoxpjkcko`. The staging rehearsal ran inside a
transaction and rolled back. Verified outcomes:

- Authorized project managers could retry a failed comparison.
- Viewer, field, cross-tenant PM, null-identity and anonymous callers were denied.
- Direct status writes were rejected. Completed, archived, populated and null-status comparisons could not be reopened.
- The existing record RPC finalized the retry; finalized evidence remained immutable.
- After rollback, the temporary retry function and synthetic users/organizations were absent. The migration ledger remained at 36 rows.

## Piece-events migration — local PostgreSQL verification

Read-only production preflight found the `id` primary key already present,
4,793 rows, no null/duplicate IDs or inbound foreign keys, and only the legacy
`idx_piece_events_piece` history index. The prior SQL attempted to resolve an
absent retained index by a strict regclass cast. The correction preserves either
sole usable history index and only removes structurally equivalent duplicates.

The exact corrected SQL passed isolated PGlite checks with network denied:

- Both equivalent history indexes, initially without a primary key.
- The production layout: existing primary key and sole legacy index.
- Sole retained index.
- Uniqueness mismatch: migration refused the drop.
- No usable history index: migration refused cleanup.

Successful layouts retained one primary key and one history index, and a second
application succeeded without removing the retained index. Static regression
tests also passed within the final 7,235-test / 760-file suite.

A separate real-staging index rehearsal was submitted as BEGIN/ROLLBACK with
25-second statement and 2-second lock timeouts, but its tool request returned no
result and was aborted after about 20 minutes. Its cases and post-rollback state
are **unverified**. No COMMIT was submitted. Before deployment, verify staging
state and rerun the bounded index rehearsal; do not treat this request as proof.

## Exact migration payloads

| File | SHA-256 |
|---|---|
| `20260922015713_piece_events_primary_key_and_index_cleanup.sql` | `5e91c05e0d37e2775f11f5d734df7d5cc955b471f1bd2bbed9c84c43f94f1b80` |
| `20261005100745_retry_failed_revision_comparison.sql` | `e05b215cc397e96d41bf10d037d491ff1b2078db62fd60762c13b1fdcdd9839d` |

## Remaining release prerequisites

The account-deletion runtime/authorization tests pass locally. Authenticated
staging HTTP timeout and concurrent-membership checks remain required; follow
`supabase/tests/account-deletion/README.md`. Then apply and stamp the exact
committed SQL through the repository manual protocol, deploy the matching Edge
Function through the reviewed workflow, and restore all four production gates.
The CI Supabase drift check currently returns HTTP 401. No gate was disabled.
