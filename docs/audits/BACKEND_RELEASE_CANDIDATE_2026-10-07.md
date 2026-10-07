# Reviewed backend candidate — 2026-10-07

Status: prepared for review, not deployed. Production `kjrwqagyeswwoxpjkcko` is shared with another application. This document records read-only catalog and deployed-source inspection; it is not authorization to change production.

## Database evidence and application order

The production ledger contains 132 versions. The unmodified reconciliation planner reports the following five required versions missing, with no unknown inventory blockers. An inventory match does not establish schema or function-source equivalence.

| Order / version | Candidate | Observed production state |
|---|---|---|
| 1 / `20260922015713` | `piece_events_primary_key_and_index_cleanup.sql` | The `id` primary key and sole usable legacy `(piece_id, created_at DESC)` index already exist. The candidate preserves that index; do not drop it merely to standardize its name. |
| 2 / `20260927150000` | `erasure_census_admits_project_admins.sql` | `project_row_counts(uuid)` still only checks `user_has_project_access`; it lacks the archived-project/current-membership admin branch. |
| 3 / `20260927160000` | `account_deletion_releases_authorship.sql` | `erase_my_sole_member_workspaces(text)` is absent; targeted authorship references still block erasure. This must precede the candidate account-delete function. |
| 4 / `20261005100745` | `retry_failed_revision_comparison.sql` | `retry_revision_comparison(uuid)` is absent. |
| 5 / `20261007073051` | `enforce_enrolled_mfa_at_server_boundaries.sql` | The MFA helper and PostgREST request hook are absent. Existing verified-factor accounts currently lack this server boundary. |

All SQL files are under `supabase/migrations/`. The new MFA version stays **required / pending**, never stamped as applied by these changes. The other four were already required on the base branch.

The MFA candidate adds an enrolled-factor/AAL2 request check before authenticated REST tables, views and definer RPCs. Storage objects and currently published Realtime tables receive restrictive policies composed with their existing tenant policies. Unenrolled users can complete onboarding. Existing hooks cause an abort instead of silent replacement. See [MFA tests and rollout limits](../../supabase/tests/server-mfa/README.md) and the [read-only readiness query](../../supabase/tests/server-mfa/readiness.sql).

## Deployed Edge source comparison

All seven deployed source bundles were retrieved read-only on 2026-10-07 and compared to the candidate after CRLF normalization. Twenty-eight supporting files match exactly. The six non-erasure entrypoints differ by MFA integration; email-send also includes existing TypeScript ArrayBuffer annotations and comment formatting. The account-delete candidate includes the previously pending offboarding redesign, so it requires the complete account deletion review, not a claim that this is only an MFA patch.

| Function | Observed version | Preserve gateway JWT verification |
|---|---:|---|
| llm-proxy | 43 | false — verifies bearer internally |
| email-send | 30 | true |
| stripe-billing | 30 | false — signed webhooks and internally authenticated user actions |
| project-export | 30 | true |
| command-center-session-handoff | 14 | false — authenticated creation / existing handoff protocol |
| command-center-read | 13 | false — verifies bearer internally |
| account-delete | 3 | true |

Every user-facing guard runs after Auth verifies the exact bearer token and before private reads or privileged effects. Stripe webhook handling remains separate. `email-ingest` and `health` are outside this release's function changes. A deployment must include imported source files, including `_shared/mfa.ts` and the account-delete handler modules.

## Release sequence and acceptance

Follow [Reviewed backend releases](../runbooks/reviewed-backend-release.md). Its instruction is: “Obtain approval for the named functions and exact database changes.” This shared-backend requirement is why local tests and this review package do not trigger a deployment.

1. Review the exact release commit and candidate SQL; inspect both applications' MFA compatibility and any PostgREST configuration outside the database catalog. Preserve current source bundles and JWT settings again immediately before deployment.
2. Apply and stamp each approved migration atomically in staging, using its exact committed payload. Do not nest the existing `BEGIN`/`COMMIT` wrappers when constructing the approved transaction. Never use `db push`, migration repair, or an inventory-only stamp.
3. Run transactional account-deletion/permission tests and real hosted MFA boundary tests in staging. Verify enrolled AAL1 denial and AAL2 success for REST, a definer RPC, private Storage and protected Realtime reads; verify onboarding and signed webhooks. Isolated PGlite tests do not prove hosted configuration.
4. Deploy the seven approved functions to staging preserving their JWT modes. The existing workflow allows only llm-proxy, project-export and stripe-billing; the other four require their own reviewed deployment path. Do not silently broaden that allowlist.
5. Exercise synthetic-account deletion with multi-member ownership protection, sole-member cleanup, storage failure reporting and timeout/concurrency checks. Never erase a customer account for acceptance testing.
6. Run the strengthened authenticated browser acceptance on the selected staging fixture and a two-workspace account. Verify exports, uploads, numbering, release gates and field capture. No live provider spend or outbound email is required for this local candidate verification.
7. After approval and staging evidence, release production, confirm the normal drift gate and MFA readiness query, and retain the deployment versions, SQL payload hashes, source SHA and smoke results. A frontend rollback does not undo these backend changes.

Unresolved platform semantics must remain visible: existing Storage signed URLs live until expiry, public buckets are public, Realtime DELETE events have separate filtering behavior, and future publication additions require the restrictive policy. Direct trusted SQL administrators remain trusted. Do not claim universal session revocation or hosted MFA enforcement from unit tests.
