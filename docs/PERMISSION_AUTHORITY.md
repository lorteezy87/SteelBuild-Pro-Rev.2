# Permission authority model

## Source-of-truth

- `usePermissions()` is the only UI authorization resolver.
- Permission inputs are server-backed:
  - `user_profiles.role` for global account role.
  - `get_my_project_role(project_id)` for active-project role (with global-admin override).
- `usePermissions()` returns `can()` / `canPerform()` / `canTransition()` for display behavior only.

## RLS and write authorization

- RLS and RPC enforce actual reads and writes.
- UI checks are not mutation authorization; they only control what users can see or initiate.
- Workflow transitions must always be validated with `validateTransition()`.

## Server-first extension pattern

- Add workflow/action combinations as DB policy + workflow rules first.
- Mirror those action/entity floors in `canPerform()` and tests before exposing new UI gates.
- New client actions should not ship with missing DB or workflow enforcement.
