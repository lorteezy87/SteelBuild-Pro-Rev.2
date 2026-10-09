# Feature flag privacy and writer sequence allocation

These are source candidates with isolated PostgreSQL verification. Nothing in
this directory applies or stamps migrations, deploys a client, or connects to
the hosted database.

```sh
npm ci --ignore-scripts --prefix supabase/tests/flags-sequences
npm test --prefix supabase/tests/flags-sequences
node supabase/tests/flags-sequences/verify.mjs --before
node supabase/tests/flags-sequences/verify-archived-pieces.mjs --before
```

The normal command executes the exact candidate files in PGlite, using real
PostgreSQL roles, RLS, triggers and constraints. It runs 38 flag/sequence checks
and 68 archived-piece checks. `--before`
deliberately omits the candidates and must fail the new boundary checks. The
fixture extracts existing definitions from the committed baseline, captured
function payload and relevant follow-up migrations; it is not a complete
production restore, a PostgREST/JWT integration test, or a multi-connection
concurrency test.

## Release contract

1. Confirm the deployed definitions, policy names, permissions and dependencies
   against the committed source. The fixture includes
   `20261008032524_require_current_workspace_membership_for_project_roles.sql`;
   its current-membership contract must land before the sequence candidate.
   Preserve the reviewed viewer change-request contract from
   `20260921054458_allow_project_members_to_raise_change_requests.sql`.
2. Review, commit, manually apply and stamp the exact flag candidate
   `20261009001532_protect_feature_flag_override_projection.sql` under
   `CLAUDE.md`. Verify the ledger payload/hash. Never use `db push`,
   `apply_migration`, ledger repair or a drift suppression override.
3. Coordinate that SQL with `useFeatureFlag.ts` and `FeatureFlagsAdmin.jsx`.
   The new client calls `list_effective_feature_flags()` and fails closed if
   that RPC is absent. An old client reading the raw table receives no flags
   after the policy change; use a coordinated cutover/refresh to prevent a
   temporary feature interruption. Do not restore public override-map reads
   as a compatibility workaround.
4. Manually apply/stamp
   `20261009001555_restrict_sequence_allocation_to_writers.sql`, preserving its
   exact filename/payload. Review the private allocator, trigger order and all
   CR table constraints/guards. The public number allocator requires current
   active-project access and a field-or-higher role. The existing viewer CR
   workflow is still permitted: its invoker RPC inserts the row, and a private
   trigger reserves only that row's `change_request` number in the same
   transaction. Failed inserts roll back the reservation; numbers retain all
   digits beyond 999.
5. Run the staged matrix below before production release and repeat acceptance
   with the deployed client/SQL artifacts. Local passing checks do not close
   deployment, provider, concurrency or production-drift acceptance.

## Staged acceptance

- Ordinary viewer, field and tenant owner accounts can read only effective
  `flag_key`/`enabled` pairs for their current `auth.uid()` account. Raw maps,
  descriptions and peer emails are unavailable; forged or stale JWT email
  claims do not select another account's overrides. Deleted accounts,
  null identity and anonymous callers cannot use the projection.
- A platform administrator can list raw flags and create/toggle/edit via the
  guarded RPCs. Adding/removing one override preserves peers and removes old
  case variants for the selected email. Tenant owners without platform admin
  authority are denied. Direct CRUD remains governed by the existing guards;
  the UI retains flags and uses the switch to disable them.
- Viewer arbitrary number reservation is denied without advancing a counter.
  Field, PM, project admin and workspace owner reservations succeed only for
  accessible active projects. Foreign, removed-member and archived requests
  fail. Concurrent accepted reservations must be distinct under the real
  database; the fixture exercises sequential atomic behavior only.
- A viewer can submit a legitimate numbered CR through the existing RPC, but
  cannot directly insert or alter its number. Invalid titles and rejected
  constraints leave no new row or consumed CR number. Verify `CR-999`,
  `CR-1000` and `CR-1001`, foreign/archived project denial and guard/audit
  behavior in the full staged schema.

Feature flags remain UI rollout controls, never authorization for protected
business writes. Server role, membership and capability checks still decide
those operations. Raw flag data is deliberately platform-wide for authorized
platform administrators; it is not available to an organization administrator
solely because they administer their own workspace.

## Canonical piece command active-project candidate

`20261009003246_require_active_project_for_piece_edits.sql` replaces the
project-mode lookup in 23 existing command implementation functions with
`private.require_active_piece_project`. The helper requires the current user's
active-project access and locks the active project with `FOR SHARE` until the
transaction ends. An already archived project is refused. The helper has no
API-role EXECUTE grant. The latest `soft_delete_project` definition, adopted in
`20260914120000`, acquires its project lock after authorization and before child
writes. Canonical release now resolves the project and authorization first,
then locks the project and re-reads the same active work package under lock.
This aligns those lock orders; full-schema concurrent acceptance remains required.
Existing role floors, command bodies, business guards, wrapper RPCs, structured
errors, and command-failure audit behavior remain intact. The source contract
tests resolve the latest function declarations and implementation renames across
every migration, and compare every replaced body with that source. The only
additional body changes are the archive/release lock ordering and the model
page cursor aggregate described below.

The exact command/source inventory is `piece-command-sources.mjs`. Coverage is:

- stage, approve and apply piece imports;
- assign/unassign work packages and bulk sequence/area edits;
- link/unlink legacy sheets and current drawing sets;
- create/map material requirements and verify their receipt;
- station configuration, lot splitting, single/bulk station advancement;
- ship/deliver/erect through their shared transition implementation;
- production-import synchronization, canonical fabrication release;
- full and paginated model-element linking and hold/clear operations.

The pre-candidate SQL failed the eight archived field/PM/admin/owner hold/edit
denial cases and the archived command-entry denials. All 68
current checks pass. Active workflows exercise a real staged/approved/applied
import, sheet/set links, material receipt, lot split, assignment and rollup,
station configuration/advancement, production sync and ship/deliver/erect,
full model linking and ordered UUID pagination without omissions or repeats.
Both linkers retain the latest set-based implementation and their respective
180-second and 60-second timeouts. The page cursor uses descending UUID
`array_agg(...)[1]` because PostgreSQL has no built-in `max(uuid)` aggregate;
the former expression failed an actual SQL success test with error `42883`.
The existing already-released fabrication guard still blocks duplicate release.
Archived admin authority, piece archival, erasure census and writes after
project restoration remain available. The latest archive body retains its
skip-missing-child behavior and original admin/error contract. No shared role
resolver, table trigger, hard-delete path or restore path is changed.

Apply/stamp this exact candidate only after the membership resolver candidate,
under the same manual release procedure. Verify each deployed body against its
named source before replacement, including existing grants and owner. Staging
must exercise these RPCs through the normal Piece Register/import consumers,
real concurrent archive/edit/release requests and transaction retry behavior,
full fabrication-release evidence gates,
model-element linking, archive restoration and full erasure. The isolated
fixture loads the relevant tables/functions, not every production projection
trigger or constraint; it does not execute the entire production erasure graph.

Internal helpers `seed_default_piece_stations`,
`link_unlinked_model_elements_for_piece` and `refresh_work_package_progress`
already have authenticated/PUBLIC EXECUTE revoked in the committed migrations;
they retain internal/service maintenance behavior. `set_piece_control_mode`
unconditionally calls the current readiness function, which already requires
active-project access. `archive_piece_lots` deliberately retains its existing
admin confirmation, reason, topology, hold and production-history guards.

This verifies the inventoried canonical piece command family, not every
business table in RLS-10. Pay-application RPCs checked in the committed capture
are invokers whose SELECT policies use active-project access; an archive bypass
there was not demonstrated by this slice. Preserve the separate full-schema
pay-application and broader direct-write acceptance requirements.
