# Transactional numbered creates — local candidate

Run `npm ci` and `npm test` in this directory. The pinned PGlite 0.5.8 database is created in memory; the runner makes no hosted writes. Fixtures contain only schema/function definitions captured from staging on October 7, 2026, plus synthetic records.

Candidate: `supabase/migrations/20261007112918_transactional_numbered_record_creates.sql`. It has not been applied or stamped in staging or production. Apply/stamp only through the repository's reviewed manual release procedure after current catalog/authorization review. Never use `db push` or migration repair.

## API contract

`create_numbered_record(p_project_id uuid, p_kind text, p_client_op_id uuid, p_payload jsonb) returns jsonb`

- Kinds are exact table names: `change_orders`, `change_requests`, `deliveries`, `sov_items`, `backcharges`.
- Return value is the created entity row. An identical authorized replay returns the **current** entity row; it never restores an old snapshot or reapplies carried fields.
- Reuse one operation UUID for the same submitted draft or parsed import row, including retries after an ambiguous network failure. PostgreSQL accepts UUIDv8 import identifiers as well as random UUIDs. An operation with changed payload fails with `NUMBERED_CREATE_PAYLOAD_MISMATCH`; clients must reconcile the original attempt rather than silently mint another UUID.
- The receipt key is `(project_id, kind, client_op_id)`, shared across authorized actors to prevent duplicate imports. Every replay rechecks current membership, active project, minimum role and MFA. The original actor does not own replay rights.
- Receipt retains the SHA-256 hash of PostgreSQL's canonical JSONB text and a record UUID, not plaintext payload/result. A soft-deleted/missing result produces `NUMBERED_CREATE_RESULT_UNAVAILABLE` without another insert. Original actor attribution is nullable with `ON DELETE SET NULL`; project deletion cascades receipts. Project-scoped erasure can discover this table through its `project_id` column. No polymorphic record FK is added because receipts intentionally survive record soft deletion and span five tables.

Existing `create_*` signatures and definitions are unchanged for sibling callers. The new wrapper atomically invokes the existing numbered creation and persists previously separate fields. Backcharge `created` remains emitted by the existing RPC; `notice_sent` is written once, server-side in the same transaction. All guard flags are restored. Errors in extras, events or receipt insertion roll back the record and its transactional sequence allocation.

CO creates start Draft/Submitted; CR creates start Submitted; backcharges start draft. Delivery creates accept planning states and require the existing receive workflow for Delivered/Received. SOV preserves its existing Draft/Submitted/Certified/Paid register vocabulary. This introduces no new approval workflow. CO attachment references are nullable TEXT; backcharge attachments are non-null JSONB arrays. Nullable DTO inputs are accepted: metadata null uses the existing empty-object default, CO attachments null stays SQL NULL, and backcharge attachments null uses an empty array. Receipts still hash the original request. Explicit authority stamps and official record numbers are rejected by the payload allowlist.

Frontend option proposed to the integrating entity boundary: `create(payload, { clientOperationId })`. A new random UUID per API invocation only protects retries within that invocation; forms and imports must retain their UUID and attempted payload across user-triggered retries. Ship the client only after this candidate is applied and verified; absence of the RPC must fail clearly, with no fallback to the former partial-write sequence.

## Verification boundaries

The runner loads live captured create functions and guards and verifies the legacy partial-create defect before applying the candidate. It tests complete records, one allocation on replay, cross-user dedup, UUIDv8 import metadata, hash mismatch, current-row replay, role/workspace revocation, archived records, finite values, authority denials, extra-column/event/receipt rollback, nullable DTO compatibility, restricted receipt grants, guard-flag restoration and cleanup.

A separate embedded test loads the shipped account-erasure command, census, project/organization delete loops and lock-order correction with the live captured trigger-toggle helper. All five private receipts enter the census and project erasure audit; erasure removes the sole-member workspace, preserves another workspace and permits auth deletion. Receipt rows have only internal FK triggers, so they need no trigger-toggle relation lock. Their project column includes them in dynamic deletion, and nullable actor attribution uses `ON DELETE SET NULL` without a row guard that could block account deletion.

The fixture's entity RLS policies are deliberately minimal project-member policies; organization records and MFA response are controlled synthetic dependencies. This proves the wrapper's own authorization boundary and actual captured function/trigger interactions, not the entire production policy inventory or MFA implementation (those have separate suites).

PGlite serializes statements. Queued same-key replay is covered, but real simultaneous database sessions and advisory-lock waiting/revocation require the isolated `commercial-postgres` CI job to pass before release (see `../commercial-postgres/README.md`). The candidate takes the advisory transaction lock before receipt lookup and rechecks authorization after the wait. The unchanged source functions preserve their existing numbering and financial behavior; no legacy API is removed by this migration.
