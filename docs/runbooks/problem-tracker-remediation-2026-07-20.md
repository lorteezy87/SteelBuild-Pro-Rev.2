# Problem tracker security and Storage remediation — 2026-07-20

Status: **complete for the authorized batch, excluding item #5**.

This record captures the production and staging evidence for PR
[#94](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/pull/94), merged as
`6a0c50fbdede43c631e8873c4aec822b0ffd8331`. Times below use the
America/Phoenix work date; the linked CI records completed on 2026-07-21 UTC.

## Completed scope

- Kept account deletion disabled: `account_deletion=false`, no overrides, and
  no deployed `account-delete` Edge Function.
- Revoked direct execution of the trigger-only
  `seed_default_piece_stations_for_project()` function from `anon`,
  `authenticated`, and `service_role`.
- Replaced permissive `FOR ALL` write policies on `delivery_items`,
  `drawing_sheets`, `submittal_activity`, and `task_dependencies` with explicit
  `INSERT`, `UPDATE`, and `DELETE` policies while retaining one `SELECT` policy
  per table. Production has zero `FOR ALL` policies on these tables.
- Copied and verified all 775 legacy `app-files/uploads/*` objects into the
  founding organization's tenant prefix, rewrote reviewed database references,
  and removed the legacy-path RLS exception.
- Reconciled production and staging migration history to the three canonical
  versions: `20260721030200`, `20260721031557`, and `20260721031606`.
- Provisioned a confirmed, synthetic staging-only organization, project, and
  user for authenticated read-only E2E. The bootstrap and legacy-copy functions
  now deploy only their permanent HTTP 410 implementations.

## Production evidence

| Control | Verified result |
| --- | --- |
| Legacy Storage copy | 775 destinations; 706 matched by ETag and 69 by SHA-256; 0 missing, size mismatches, or verification failures |
| Rollback material | All 775 original legacy objects retained; 0 originals deleted |
| Database references | 0 legacy references across 23 reviewed scalar columns and `change_orders.attachments` |
| Storage RLS, founding-org member | 1,049 founding-org objects visible; 0 legacy objects visible |
| Storage RLS, non-founding member | 0 founding-org objects visible; 0 legacy objects visible |
| Trigger-only function ACL | No execute grant for `anon`, `authenticated`, or `service_role` |
| Four reviewed policy sets | 4 `SELECT`, 4 `INSERT`, 4 `UPDATE`, 4 `DELETE`, and 0 `FOR ALL` policies in aggregate |
| Maintenance authorization | Job completed and token digest cleared |

The production release passed lint, all typecheck ratchets, Vitest, the
production build, dependency audit, Vercel deployment, and post-deploy health
check in [GitHub Actions run 29801414310](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/29801414310).

## Staging evidence

The `staging` branch was fast-forwarded to the production merge. Its separate
Vercel project uses the staging Supabase project `abbeavtbifuddtrifvae`.
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are encrypted, pullable build
variables; they must not use Vercel's non-exportable Sensitive type because the
GitHub workflow performs an external prebuilt Vite build.

[GitHub Actions run 29801931119, attempt 2](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/29801931119/attempts/2)
passed full CI, dependency audit, staging deployment and health check, and the
authenticated read-only Drawings/Submittals/RFIs smoke. Mutation-capable E2E
remains disabled pending a separately approved disposable-fixture policy.

## Deliberately retained and still open

- The 775 legacy source objects remain rollback material. Their deletion needs
  a separate retention and recoverability decision.
- Account deletion remains disabled and `account-delete` remains undeployed.
- Item #5 was excluded as requested. Owner/legal/provider decisions—including
  the long-term project visibility model and branch-protection/provider
  configuration—remain open and were not silently selected by this batch.
