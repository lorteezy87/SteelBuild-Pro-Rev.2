# Workspace erasure preserves account identities

Deleting an owned workspace must not delete its members' independent sign-ins.
The former implementation collected membership IDs and deleted Auth accounts
with no remaining workspace memberships. Workspace ownership does not authorize
deleting another person's account, and a concurrent membership join made the
orphan check stale.

This release ports only the identity-preservation slice of `1fc3078f1`:
`account-delete/handlers.ts`, its handler tests, the entrypoint's explanatory
comment, and the workspace danger-zone wording. The four files' pre-change
versions matched that source commit's parent. Existing JWT/MFA verification,
workspace ownership checks, database erasure and storage cleanup remain in place.
Workspace deletion now reports `users_deleted: 0`. Explicit account deletion
still targets only the signed-in caller. Workspace cleanup failures direct the
user to support without suggesting that they delete their account.

On October 9, the new tests reproduced five failures against current main,
including two Auth identities deleted by one workspace operation. After the
scoped port, all 44 account-deletion tests across three files passed. They cover
identity preservation, concurrent membership changes, cleanup failures and
explicit self-deletion. Focused ESLint and `git diff --check` passed. Independent
review found no blocking issue. Full CI and reviewed hosted deployment remain
separate release gates; these mocked tests did not delete any live workspace,
file or account.
