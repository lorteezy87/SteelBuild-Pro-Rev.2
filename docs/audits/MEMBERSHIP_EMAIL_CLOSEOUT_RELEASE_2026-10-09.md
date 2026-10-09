# Membership, outbound email and closeout isolation release candidate

This narrowly ports committed security changes from `219aa4f3e2afebab9984aca69d713d27e908952e` onto current `main`. No uncommitted security-worktree changes are included. The existing enrolled-MFA helper and handler checks remain in `email-send`; the three application/SQL files match the committed security source exactly.

## Fixes and release order

- The three canonical project-role resolvers now require current workspace membership before trusting retained `user_projects` rows. Existing role precedence and execution grants are preserved. Archived projects retain role resolution so current administrators can finish erasure.
- `email-send` asks the canonical access and minimum-PM-role RPCs using the verified caller's bearer token and the anon API key before service-role mail reads or outbound provider effects. Removed members, foreign workspaces, archived projects, viewers and field users are denied. Unavailable or malformed permission results fail closed with 503. Existing MFA, identifier checks, mail quotas and provider behavior remain intact.
- Project Closeout binds mutations and callbacks to the initiating project/workspace generation. Delayed failures or successes cannot overwrite a new workspace's cache, show its predecessor's private errors, or start a write after scope changes during query cancellation. Current-scope rollback and feedback still work.

Required SQL: `supabase/migrations/20261008032524_require_current_workspace_membership_for_project_roles.sql`.

SHA-256: `281a52c5d64136f81cf30e37240990f575eb2cea920398511d7e08b524984dbf`.

Email source SHA-256: `8c3cc94345082622b6b5cb6bbd0a1ae785d8c85e981b83b33320a2c95cf59818`.

Read-only production preflight confirmed the migration is absent and all three existing helpers are executable by `authenticated`, not `anon` or `service_role`. The migration remains explicitly **required** in the ownership manifest; missing application must block the frontend publisher. This branch performs no hosted SQL or Edge Function mutation. Stage the exact SQL and verify the full current catalog before production, then release the reviewed email source with its existing gateway-JWT contract and same-commit staging evidence. Use only the reviewed manual apply/stamp procedure; never `db push`, `apply_migration`, or ledger repair.

## Verification

- Membership fixture against pre-fix definitions: 18 passes / 18 failures, including a removed admin successfully archiving an invisible project. With the candidate: all 36 pass.
- New closeout/email tests against the unchanged `main` implementations: 23 failures / 6 passes, with stale cache restoration, extra refetches/private notifications and outbound authorization regressions reproduced. With the port and existing MFA checks: 60 targeted tests pass across closeout identity, complete email handler execution, MFA entrypoints and migration classification.
- The membership PGlite suite is added inside the required application CI job. It uses shipped SQL definitions and synthetic in-memory identities only. Its reduced catalog does not establish full hosted-schema replay or concurrent revocation behavior.
- Complete lint/type/build and hosted CI verification are recorded in the pull request before release.

Already-running PostgreSQL statements still use their snapshot. Rejoining a workspace restores retained historical explicit project grants; changing that grant-retention policy is outside this migration. These fixes do not close broader mailbox binding, atomic email quotas, backup recovery or monetization acceptance work.
