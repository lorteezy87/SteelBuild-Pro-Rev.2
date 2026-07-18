# Permission authority model

## Source-of-truth

- `usePermissions()` is the only UI authorization resolver.
- Permission inputs are server-backed:
  - `user_profiles.role` for global account role.
  - `get_my_project_role(project_id)` for active-project role (with global-admin override).
- `usePermissions()` returns `can()` / `canPerform()` for display behavior only.

## RLS and write authorization

- RLS and RPC enforce actual reads and writes.
- UI checks are not mutation authorization; they only control what users can see or initiate.
- Transition rules live in active domain command or RPC implementations.
- Those domain checks plus RLS/RPC are the final authority.

## Server-first extension pattern

## Domain transition authority

- Transition rules are implemented with live domain commands or database RPCs.

## Server-first extension pattern

- Add workflow/action combinations as DB policy + domain commands/RPC rules first.
- Mirror those action/entity floors in `canPerform()` and tests before exposing new UI gates.
- New client actions should not ship with missing DB or workflow enforcement.
