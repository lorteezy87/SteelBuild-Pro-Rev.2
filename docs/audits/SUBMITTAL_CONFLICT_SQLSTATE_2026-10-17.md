# Nonretryable submittal review conflicts

Production publication and SQL application remain on hold. This source change
does not approve, retry or reconcile any package and was not applied to a hosted
database by its implementer.

The staging concurrent-release browser scenario sends a reviewed command after
another legitimate command releases the same fresh synthetic package. The
deterministic stale-parent guard raises `ROUND_STALE` with SQLSTATE `40001`.
Read-only staging inspection reported PostgREST 14.5, both installed workflow
guards and the publish-parent guard using `40001`, and repeated stale errors.
Supabase documents that PostgREST 14 retries these exceptions indefinitely:
[SQLSTATE 40001 in RPC functions](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

Migration `20261017081234_nonretryable_submittal_revision_conflicts.sql` changes
only the three exact deterministic stale exceptions to `PT409`, returning HTTP
409 without a serialization retry. It reads each installed function definition
instead of replacing it with an older full body. Every exact exception must occur
once; missing or duplicate matches abort the entire patch transaction. Existing
authorization, MFA, row/advisory locks, revision coverage checks, immutable history,
request replay, function owners and execution grants remain intact. Genuine
PostgreSQL serialization failures are not caught or rewritten.

The regression reproduced `40001` before the patch. The fixture harness verifies
all three conflict codes and unchanged saved-state snapshots, the existing 38
workflow cases, exact function-definition/ACL preservation, and atomic rejection
of missing or duplicate guard drift. The existing PostgreSQL harness runs the
same checks plus independent-session stale-parent and revision-swap races.

This explains the newly reproduced staging stale-command hang. It does not prove
the exact original Anchor Bolts rejection payload or coverage reason, which remain
unavailable. Root review must verify the exact committed SQL bytes/hash, manually
apply and stamp the matching version on staging, and repeat real browser recovery
before considering any separately authorized production operation.
