# Company Capability Security Model

**Status:** Approved direction; implementation requires a separately reviewed plan

**Date:** 2026-10-12

**Scope:** Company operating modes, server-enforced capabilities, historical access, and explicit intercompany sharing

## Decision summary

SteelBuild Pro will support three company operating-mode presets:

- `fabrication_only`
- `erection_only`
- `combined`

An operating mode is product configuration. It is not a role, membership type, feature flag, or authorization shortcut. The server authorizes every protected operation by composing:

1. a current authenticated identity with any required MFA assurance;
2. current organization membership;
3. current project access and the required project role;
4. the owning company's enabled capability for the requested domain and access kind; and
5. an explicit intercompany grant when the caller's company does not own the resource.

Navigation and page composition consume the same effective-capability snapshot for usability, but are never the security boundary. Existing companies are backfilled as `combined`, so introducing the model does not silently remove access.

Disabling a capability stops new writes, imports, RPC commands, Edge Function actions, background work, and offline replay immediately. Existing records remain readable and exportable only under the historical-read rules below and only while the user still has current organization/project authority. Removed users receive no historical access.

## Goals

- Let a company select fabrication-only, erection-only, or combined workflows without exposing irrelevant operational functions.
- Keep erection-only delivery, piece, drawing, RFI, change, field, inspection, schedule, and closeout workflows usable without exposing a supplier's private fabrication operations.
- Enforce company capability choices at every server boundary, including direct REST/RPC requests, Edge Functions, storage, exports, imports, offline replay, scheduled work, and service-role jobs.
- Preserve legitimate historical records when capabilities are disabled while preventing new domain activity.
- Require deliberate, scoped grants for data sharing between separate companies.
- Make capability changes attributable, concurrency-safe, testable, and reversible.
- Ship without changing the repository's reviewed manual Supabase migration process.

## Non-goals

- Replacing organization membership, project roles, or existing RLS policy semantics.
- Treating `moduleGating.js` or `feature_flags` as authorization state.
- Adding per-project capability overrides in the first release.
- Granting access because two organizations have a vendor, supplier, customer, or delivery relationship.
- Building a generic cross-company write framework. Initial intercompany grants are read-only and domain-specific.
- Automatically applying, repairing, or stamping a production migration.
- Enabling company-mode selection in production before enforcement coverage and hosted acceptance are complete.

## Current-state findings

The current app already has several foundations that this design must preserve:

- A project belongs to one organization through `projects.org_id`.
- `organization_members` establishes current company membership.
- `user_projects` and the org-aware `user_has_project_access`, `get_my_project_role`, and `user_has_project_role_at_least` functions establish project access and role.
- Removed organization members cannot retain access through stale `user_projects` rows.
- Archived projects can still be read by currently authorized users where existing policy permits.
- `moduleGating.js` maps pages to global/per-user rollout flags. It explicitly does not model per-company or per-project authority.
- `project-export` uses the caller JWT and RLS, but currently exports every RLS-visible project table after only a project-level access check.
- Field and Planner offline queues replay durable/idempotent operations later. Authorization therefore must be checked when the server applies the replay, not only when the client enqueues it.

These findings lead to an additive design: capabilities narrow existing authority; they never create membership, project access, or role authority.

## Security invariants

1. **Capability checks only subtract authority.** A capability cannot make an otherwise unauthorized user authorized.
2. **Current membership is mandatory.** Historical reads, archived projects, grants, cached snapshots, and offline receipts never bypass membership removal.
3. **The resource owner controls sharing.** Only an authorized admin of the owning organization may create or revoke an intercompany grant.
4. **Relationships are not grants.** Vendor/supplier/customer records confer no access.
5. **Private fabrication data is never inferred to be shareable.** Erection users consume a curated logistics contract, not the supplier's fabrication tables.
6. **Replay evaluates current policy.** The server rechecks identity, membership, role, capability, and grant when a queued command is replayed.
7. **Service-role use does not imply permission.** Background and Edge processes must carry and validate an actor or an approved system-operation identity plus owning org, project, capability, and purpose.
8. **Unknown capability or unclassified surface fails closed.** There is no default-allow fallback for an unrecognized key.
9. **Changes are atomic and audited.** A preset change, its effective capability state, revision, and immutable event are committed in one transaction.
10. **Mode labels do not authorize requests.** Server helpers resolve the current capability state; they do not branch on `operating_mode` alone.

## Capability vocabulary

Capabilities represent business domains. The requested access kind (`read`, `write`, `export`, or `share`) remains a separate input so project roles and historical-read rules can be composed consistently.

| Capability key | Protected domain | Notes |
| --- | --- | --- |
| `project_coordination` | Project header, scope, contacts, members, alerts, actions | Company membership and project roles still govern each action. |
| `document_coordination` | Drawings, submittals, RFIs, revisions, transmittals, GC documents | Shared by all presets. Storage objects inherit the same classification. |
| `schedule_coordination` | Schedules, look-ahead dates, constraints, calendars | Shared by all presets; role still controls mutation. |
| `piece_logistics` | Curated piece identity, package, shortage, hold, shipment, delivery, and receipt state | Deliberately excludes private shop station, labor, cost, internal QC, and internal notes. |
| `fabrication_operations` | Private shop production, station progress, shop labor, capacity, internal production notes | Disabled for erection-only companies. |
| `fabrication_release` | Fab release gates and release commands | Disabled for erection-only companies. |
| `procurement_control` | Material requirements, purchasing, and supplier procurement records | Disabled by the erection-only preset; future explicit configuration may enable it. |
| `erection_operations` | Field planning, crews, equipment, site readiness, daily logs, photos, LEMs | Disabled for fabrication-only companies. |
| `shop_quality` | Shop inspection and fabrication QC records | Disabled for erection-only companies. |
| `field_quality_safety` | Field inspections, safety, punchlist, erection QC | Disabled for fabrication-only companies. |
| `commercial_control` | Contract, SOV, change, pay application, backcharge, and expense records | Enabled for all presets; roles and row policies remain authoritative. |
| `closeout_control` | Closeout, warranty, and handoff records | Enabled for all presets because either company type may own closeout obligations. |
| `reporting` | Dashboards, reports, generated summaries, and ordinary domain reporting | Report contents are the intersection of reporting access and each underlying domain capability. |

`project_export` and `supplier_collaboration` are not standalone sources of data authority. Export composes the underlying domain classifications, and supplier collaboration requires a typed intercompany grant.

### Preset matrix

| Capability | Fabrication only | Erection only | Combined |
| --- | :---: | :---: | :---: |
| `project_coordination` | On | On | On |
| `document_coordination` | On | On | On |
| `schedule_coordination` | On | On | On |
| `piece_logistics` | On | On | On |
| `fabrication_operations` | On | Off | On |
| `fabrication_release` | On | Off | On |
| `procurement_control` | On | Off | On |
| `erection_operations` | Off | On | On |
| `shop_quality` | On | Off | On |
| `field_quality_safety` | Off | On | On |
| `commercial_control` | On | On | On |
| `closeout_control` | On | On | On |
| `reporting` | On | On | On |

The preset is a complete, versioned capability set. Version one does not expose individual capability toggles, because partially supported combinations would create untested authorization states. Adding custom configurations later requires the same coverage manifest and acceptance matrix as a new preset.

## Authoritative data model

The authoritative configuration belongs in the unexposed `private` schema. Client code never reads or writes these tables directly.

### `private.organization_operating_modes`

One row per organization:

- `org_id uuid primary key references public.organizations(id) on delete cascade`
- `operating_mode text not null check (...)`
- `preset_version integer not null`
- `revision bigint not null`
- `updated_at timestamptz not null`
- `updated_by uuid null references auth.users(id) on delete set null`

The three accepted mode values are the exact values listed above. `revision` increases on every accepted change and supports optimistic concurrency.

### `private.organization_capability_state`

One row per organization and capability:

- `org_id uuid not null references public.organizations(id) on delete cascade`
- `capability_key text not null`
- `enabled boolean not null`
- `disabled_at timestamptz null`
- `preset_version integer not null`
- `revision bigint not null`
- `updated_at timestamptz not null`
- `updated_by uuid null references auth.users(id) on delete set null`
- primary key `(org_id, capability_key)`

`disabled_at` is null while enabled. When a preset disables a capability it is set to the transaction timestamp. Re-enabling clears it. A later disable receives a new cutoff, so data legitimately created during a re-enabled interval becomes historical at the later cutoff.

Tables have RLS enabled and all privileges revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`. Only reviewed owner functions operate on them. An index on `(org_id, capability_key, enabled)` supports authorization helpers; the primary key already serves the common point lookup.

### `public.organization_capability_events`

Append-only audit records contain:

- event id and organization id;
- prior and new mode, preset version, and revision;
- actor id and request correlation id;
- reason supplied by the admin;
- prior and new capability documents;
- event timestamp.

Direct insert, update, and delete are denied. A guard trigger rejects mutation after insert. Current org owners/admins may read events; ordinary members may not. The migration explicitly enables RLS and grants only the required `SELECT` access instead of relying on automatic Data API exposure. Hard organization erasure removes the rows through the repository's existing reviewed erasure workflow. The event is immutable during the organization's lifetime, not exempt from required account/org erasure.

### Bootstrap and backfill

- Existing organizations receive `combined`, preset version 1, revision 1, and all combined capabilities enabled.
- `create_organization` creates the mode row and complete capability state in the same transaction as the organization and owner membership.
- A missing mode/capability row is an authorization error after cutover, never an implicit `combined` result.
- Before cutover, a separately named compatibility helper may return the existing behavior only while an explicit release flag is off. That helper is removed when enforcement becomes required.

## Server contracts

### Read-only snapshot

`public.get_my_organization_capabilities(p_org_id uuid)` is a `SECURITY INVOKER`, `STABLE` wrapper over an auth-checking `private.get_my_organization_capabilities(p_org_id uuid)` implementation. The private implementation is `SECURITY DEFINER`, has `search_path = ''`, schema-qualifies every object, and is not in an exposed Data API schema. The wrapper:

1. requires `auth.uid()` and current membership in `p_org_id`;
2. returns the operating mode, preset version, revision, and complete capability map;
3. returns no cross-org data; and
4. grants execute only to `authenticated`.

The UI caches this snapshot under a query key containing user id, org id, and revision. Org switch, auth change, membership change, or mode update clears it. A stale client snapshot may render obsolete chrome briefly, but the server still enforces current state.

### Mode update

`public.set_organization_operating_mode(p_org_id, p_mode, p_expected_revision, p_reason)` is the only client-callable mutation. It is a `SECURITY INVOKER` wrapper over an auth-checking `private.set_organization_operating_mode(...)` implementation. The private implementation:

1. requires an authenticated current owner/admin and `steelbuild_security.satisfies_mfa()`;
2. locks the current mode row;
3. rejects an unexpected revision;
4. validates a known complete preset and version;
5. updates every capability row, cutoff, mode row, and revision atomically;
6. appends the immutable event; and
7. returns the new snapshot.

The private implementation is `SECURITY DEFINER`, has `search_path = ''`, qualifies every object, and can be executed only through narrowly granted authenticated access. The public wrapper grants execute only to `authenticated`. The private schema is not exposed through the Data API, and all unrelated function/table privileges are explicitly revoked.

### Authorization helpers

Private helpers expose no direct execute privilege to app roles:

- `private.org_capability_decision(org_id, capability_key, access_kind, resource_created_at)`
- `private.project_capability_decision(project_id, capability_key, access_kind, resource_created_at)`
- `private.intercompany_read_decision(actor_org_id, owning_org_id, project_id, capability_key, resource_kind, resource_id)`

RLS policies and reviewed RPCs call these helpers with `(select auth.uid())`-based membership functions so PostgreSQL can use initplans. Helpers return false for null, unknown, incomplete, or inconsistent inputs. Required FK and policy columns are indexed.

The decision order for an owned project request is:

1. authenticate and satisfy the repository's MFA policy;
2. resolve the project and owning org;
3. require current organization membership;
4. require project access and the operation's project role;
5. require the capability decision for the requested access kind;
6. apply row-specific workflow/immutability rules.

For an intercompany request, step 3 requires membership in the caller's grantee org instead of the owning org. The typed grant then supplies only the explicitly shared read authority; it does not weaken grantee-project membership/role checks and never creates membership or administrative access in the owning org.

## Historical-read policy

Historical access applies only when a capability is disabled and only to records that existed before its current `disabled_at` cutoff.

- `write`, `share`, background generation, imports, and replay return denied as soon as the capability is disabled.
- `read` and `export` may proceed for a row whose trustworthy `created_at <= disabled_at`, provided current membership, project access, role, archive rules, and row policies also pass.
- Re-enabling a capability restores ordinary role-authorized operation. Disabling it again establishes a new cutoff.
- Removed members and removed project users receive no access, regardless of cutoff.
- Archived projects follow existing current-user access rules; archive status does not resurrect membership.
- Records without a trustworthy immutable creation timestamp fail closed for historical reads until their domain receives a reviewed timestamp/classification migration.
- Derived reports may include only source rows that independently pass the rule. A historical report is not permission to requery newer or disabled-domain data.
- Downloads and storage objects use the owning database record's creation/classification data, not client-supplied metadata or path naming alone.

The coverage manifest described below records whether each protected resource has a trustworthy historical cutoff. A preset cannot be released while a resource it disables remains unclassified.

## Intercompany and supplier collaboration

Company-to-company access is modeled independently from vendor records and operating modes.

### Initial grant model

Version one supports read-only, typed grants. It does not use a polymorphic `scope_id` table and does not grant an entire supplier project by default.

`private.intercompany_project_grants` establishes the relationship envelope:

- owner organization;
- grantee organization;
- owning project and linked grantee project;
- allowed capability;
- `read` permission only;
- start/expiry/revocation timestamps;
- creator, reason, and audit metadata.

Constraints require distinct organizations, verify that each project belongs to its stated organization, and prevent a grant from being rebound to different projects. Typed child grant tables reference both the envelope and a real resource FK. The first supported child is a delivery/logistics grant; later drawing/document grants are added per domain with their own safe projection and tests.

Grant creation/revocation requires a current owner/admin of the owning org, MFA, and an enabled owning-org `piece_logistics` or applicable domain capability. Grant consumption requires:

- current membership in the grantee organization;
- the grantee's enabled corresponding capability;
- a live unexpired/unrevoked grant;
- current project access and the required role on the linked grantee project; and
- access through a curated view/RPC, not direct access to the owner's base tables.

### Logistics projection

The erection-facing logistics contract may expose only the fields needed to plan and receive work, such as:

- piece mark, quantity, type, area/sequence, and work package label;
- promised, shipped, and received dates;
- shipment/delivery status and externally shareable holds/shortages;
- linked issued drawing identifiers needed for erection;
- supplier contact details deliberately included in the grant.

It excludes shop station history, labor hours, capacity, estimates, actual cost, internal procurement, private shop QC, internal notes, unrelated projects, and organization-wide supplier data. Redaction is a server-side projection with explicit columns; it is not client filtering.

## Enforcement coverage

Each server entry point must be assigned a capability and access kind in a version-controlled coverage manifest. Categories include:

- database tables, views, RLS policies, triggers, and storage buckets;
- public RPCs and all `SECURITY DEFINER` functions;
- Edge Functions;
- imports, bulk actions, CSV/data exchange, and file uploads;
- project/workspace export and downloads;
- offline field and Planner replay;
- scheduled jobs, alerts, email ingestion/sending, and other background work;
- reports, generated documents, dashboards, LLM prompts, and search/read aggregators.

CI validates that every classified resource points to a known capability, that no released preset disables a domain with an unclassified write/export/replay surface, and that new protected entry points update the manifest. A page name may map to multiple capabilities and one capability may span multiple pages.

### Direct table access and RPCs

RLS `USING` and `WITH CHECK` expressions compose the capability helper with existing membership/role predicates. RPCs recheck capability inside the transaction immediately before mutation; client preflight is informational only. Sensitive `SECURITY DEFINER` functions retain explicit actor, membership, role, MFA, and capability checks with revoked public execution.

### Edge Functions and service jobs

Caller-driven Edge Functions use the caller JWT and a narrow authorization RPC before any service-role operation. The authorization decision returns only the required org/project/capability decision, not broad data. Jobs without a human caller use a reviewed system-operation contract containing job kind, owning org/project, capability, and correlation id. Disabling a capability causes new work to be skipped/denied and audited; it does not make a service role an exception.

### Export and download

`project-export` must not iterate a single unconditional table list. Every export table, folder record, and storage manifest entry is classified. The function either:

- exports the caller-authorized subset with an explicit omitted-domain manifest; or
- rejects the requested full export when it would be incomplete.

The user chooses full or authorized-subset export explicitly; silent partial backups are prohibited. Historical cutoffs apply per row. The audit record includes requested scope, exported domains, omitted domains, row totals, actor, and capability revision.

### Offline replay

Queue records may be created while offline, but the authoritative replay RPC checks the current capability after idempotency lookup is bound to the same user/project/payload and before applying any new mutation. A receipt from a previously completed operation can return its stored result without reapplying the mutation. A not-yet-applied operation denied by a mode change remains queued with a permanent `capability_disabled` failure so the UI can explain and let the user discard/export the local draft. It must not retry forever or be silently marked synced.

## UI and onboarding behavior

- New workspace creation asks the owner to choose a preset, with `combined` as the explicit default if they proceed without changing it.
- Existing workspaces initially display `combined` from the server backfill.
- Only current owners/admins see mode settings; changing mode requires MFA, a reason, and confirmation describing affected writes and historical visibility.
- Navigation, dashboards, command palettes, direct routes, empty states, reports, terminology, and prompts consume the effective snapshot.
- Direct navigation to a disabled domain renders an access explanation, not a misleading not-found page and not a redirect loop.
- Mixed pages render only capability-authorized panels and server-filtered data. For example, an erection-only Piece Register uses the logistics projection and never loads private fabrication queries.
- A disabled-domain page cannot be kept functional merely because its old route remains reachable.
- Rollout feature flags may hide the settings UI during staged release, but they do not change the server decision.

## Errors, audit, and observability

Server denials use stable machine-readable reasons:

- `membership_required`
- `project_access_required`
- `role_insufficient`
- `capability_disabled`
- `historical_cutoff_exceeded`
- `intercompany_grant_required`
- `intercompany_grant_expired`
- `capability_configuration_incomplete`
- `mfa_required`
- `revision_conflict`

Client messages may explain the remedy but must not disclose the existence or contents of an unauthorized resource. Security logs record ids, capability, decision reason, revision, entry point, and correlation id—never sensitive row payloads, tokens, signed URLs, or file contents. Repeated direct-request denials and service jobs skipped because of a mode change are observable without creating an audit row for every harmless navigation render.

## Acceptance and verification

### Required authorization matrix

Automated PostgreSQL acceptance creates:

- two organizations;
- two projects per organization;
- `combined`, `fabrication_only`, and `erection_only` states across runs;
- viewer, field, PM, admin, and owner actors;
- removed organization members and removed project users;
- active and archived projects;
- enabled and disabled domain data on both sides of a historical cutoff;
- live, expired, revoked, wrong-project, wrong-resource, and wrong-company grants.

For every protected domain, tests call direct REST-equivalent SQL/RLS paths and RPCs independently of menu visibility. They prove permitted positive cases and, first, negative cases for cross-org access, insufficient role, removed membership, disabled capability, post-cutoff rows, forged resource ids, expired grants, and stale capability revisions.

### Surface-specific checks

- **RLS:** select/insert/update/delete and nested relationship paths.
- **RPC:** direct invocation, forged org/project arguments, `SECURITY DEFINER` execution grants, and concurrent mode changes.
- **Storage:** list/download/upload/move/delete for owned, historical, disabled, and granted resources.
- **Edge:** missing/expired JWT, MFA state, membership revoked during request, and capability changed before service-role action.
- **Export:** full versus subset behavior, row cutoffs, storage manifests, omitted-domain manifest, and audit actor.
- **Offline:** enqueue enabled then replay disabled, replay after membership removal, idempotent completed receipt, permanent denial UX, and identity switch.
- **Background:** disabled capability skip, re-enable behavior, and owning-org isolation.
- **UI/routes:** menus, direct URLs, mixed pages, org switch, cached snapshot invalidation, and accessible explanations.

### Repository gates

Each implementation slice runs its narrow SQL/Vitest package first, then the repository's required lint, TypeScript/JavaScript checks, strictness ratchets, no-new-JavaScript check, Edge typechecks where affected, full Vitest suite, production build, drift classification, and commercial/concurrent PostgreSQL acceptance as applicable. New application code is TypeScript.

## Release sequence

### Slice 1: capability foundation

- Add private state tables, immutable audit, catalog/preset definitions, snapshot/update RPCs, and authorization helpers.
- Update organization creation and hard-erasure paths.
- Backfill all existing organizations to combined.
- Add SQL tests for membership, roles, MFA, revisions, immutability, historical cutoffs, and default-deny behavior.
- Keep production behavior in compatibility mode until enforcement coverage is ready.

### Slice 2: server enforcement

- Build and validate the coverage manifest.
- Add capability composition to RLS, mutating RPCs, storage, imports, export/download, Edge Functions, background jobs, and offline replay.
- Add curated piece/logistics projections.
- Do not release the mode selector until every preset-disabled domain has complete write/export/replay classification.

### Slice 3: intercompany grants and product UI

- Add typed, read-only delivery/logistics grants and immutable grant audit.
- Update onboarding, settings, organization context, navigation, routes, dashboards, mixed pages, terminology, and denial UX.
- Keep feature-flagged while hosted acceptance is incomplete.

### Slice 4: hosted acceptance and release

- Review exact committed migration files and ledger versions.
- Apply and stamp them manually in staging using the repository runbook.
- Validate with synthetic accounts covering the full negative matrix, direct API/RPC requests, exports/downloads, and offline replay.
- Run required GitHub release checks and drift gates.
- Obtain separate authorization for the named production migrations and function deployments, then apply matching files and stamps by hand.
- Verify production state without using `supabase db push`, migration repair, MCP `apply_migration`, or ownership-manifest edits to suppress pending work.

## Rollback and failure behavior

- UI rollout can be disabled without weakening server enforcement.
- A mode change can be reversed through the audited RPC; direct table edits are not a rollback mechanism.
- If capability configuration is missing or inconsistent, protected operations fail closed with `capability_configuration_incomplete` and alert operators.
- A database rollback migration must preserve capability events and restore a coherent combined state; it cannot simply drop guards while mode-specific data exists.
- Intercompany grant revocation is immediate for new reads and downloads. Already downloaded files cannot be recalled, so grant confirmation communicates that limitation.
- Production drift remains blocking until reviewed migrations are applied and stamped with exact matching payloads.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| UI hiding is mistaken for authorization | Server capability helpers are composed into RLS/RPC/Edge/storage decisions; direct-request tests are mandatory. |
| Broad tables mix shareable logistics with private fabrication fields | Use explicit server projections and typed grants; never `select *` for collaboration. |
| Disabled modules keep mutating through imports or jobs | Coverage manifest includes every write/replay/background surface and CI fails on unclassified additions. |
| Historical access leaks newly created records | Compare trustworthy creation timestamps to the current disable cutoff; unclassified records fail closed. |
| Service-role code bypasses tenant rules | Require narrow authorization decisions and actor/system-operation context before service-role actions. |
| Stale clients continue after a mode change | Server reads current revision; clients invalidate snapshots, and replay returns a permanent explanatory denial. |
| Preset growth creates untested combinations | Ship only complete versioned presets; custom toggles require a separate design and full matrix. |
| Cross-company sharing expands accidentally | Start read-only, use typed FK-backed grants, enforce expiry/revocation, and expose curated columns only. |

## Definition of done

This architecture is complete only when all of the following are true:

- The mode is stored as server-owned product configuration and existing orgs are safely backfilled.
- Capability checks compose with current membership, project role, MFA, row rules, and typed grants.
- Erection-only can complete setup through closeout using logistics/field records without reading supplier-private fabrication data.
- Fabrication-only cannot mutate erection/field domains but retains its relevant project, commercial, logistics, quality, reporting, and closeout work.
- Combined preserves existing legitimate behavior.
- Disabling a capability stops every new write path, including direct API/RPC, imports, offline replay, Edge, export generation, and background jobs.
- Historical reads obey cutoffs and current authorization.
- Removed users, wrong-company users, and ungranted suppliers receive no access.
- All required local and hosted negative tests pass.
- Exact reviewed migrations and functions are manually released through the existing staging/production process with drift gates green.
