# Company Capability Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fabrication-only, erection-only, and combined company modes whose capabilities are enforced across database, Edge, storage, export, offline, background, and UI surfaces without weakening current membership or project-role boundaries.

**Architecture:** A private, versioned company-capability state narrows existing org/project/RBAC authority. Public Data API RPCs are security-invoker wrappers over narrowly granted, auth-checking private definer functions; restrictive RLS policies, transactional RPC guards, Edge authorization, and typed collaboration grants all resolve the same current state. Existing organizations start in combined mode, and non-combined selection stays server-disabled until the coverage manifest and hosted acceptance are complete.

**Tech Stack:** PostgreSQL/RLS, Supabase Auth/Storage/Edge Functions, TypeScript, React 18, TanStack Query, Vitest, PGlite, Playwright, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-10-12-company-capability-security-design.md`

## Global Constraints

- Operating mode is product configuration, not membership, role, or feature-flag authority.
- Every allow decision composes current identity/MFA, current org membership, current project access/role, enabled capability, and a typed grant when the owner org differs.
- Existing organizations backfill to `combined`; a missing or unknown capability fails closed.
- Version 1 has no per-project overrides or arbitrary capability toggles.
- Historical reads require a trustworthy `created_at <= disabled_at`; records without a trustworthy cutoff fail closed.
- Vendor, supplier, customer, delivery, or contact relationships never grant access.
- Cross-company version 1 grants are read-only, typed, resource-scoped, expiring/revocable, and use explicit server projections.
- Public RPCs are `SECURITY INVOKER` wrappers. Required definer implementations live in `private`, use `search_path = ''`, fully qualify objects, check `auth.uid()`, and have explicit execute grants.
- Public tables explicitly enable RLS and declare grants; do not depend on automatic Data API exposure.
- New application code is `.ts`/`.tsx`; do not grow strictness ignore lists.
- Generate every migration with `supabase migration new <name>` and use the returned path. Never invent a timestamp.
- Never use `supabase db push`, migration repair, MCP `apply_migration`, or ownership-manifest edits to dismiss pending work.
- Apply and stamp reviewed migrations manually, with the committed filename equal to the ledger version and the ledger payload hash matching the file.
- Keep the company-mode selector dark until a separate cutover migration and release authorization enable it.

## Review Focus

- Missing, partial, duplicated, or unknown capability state must return `capability_configuration_incomplete`, never implicit combined access; Task 3 pins this.
- A removed member with a cached snapshot, live grant, archived project, or offline operation must receive no access; Tasks 3, 4, 9, and 11 pin this.
- Re-enable then disable again must use the newest cutoff without exposing post-cutoff rows from any disabled interval; Task 3 pins this.
- A mixed-domain export must be either an explicit authorized subset with omissions or a rejected full export, never a silently incomplete backup; Task 8 pins this.
- A mode change racing a queued replay or service-role operation must be denied at application time and leave a recoverable local draft/audited skip; Tasks 7 and 9 pin this.

---

## Phase A — Authoritative foundation

### Task 1: Capability catalog and coverage contract

**Files:**
- Create: `src/config/companyCapabilities.ts`
- Create: `src/config/__tests__/companyCapabilities.test.ts`
- Create: `supabase/company-capability-coverage.json`
- Create: `scripts/validate-company-capability-coverage.mjs`
- Create: `scripts/__tests__/companyCapabilityCoverage.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `OperatingMode`, `CapabilityKey`, `CapabilityAccessKind`, `CapabilitySnapshot`, `OPERATING_MODE_PRESETS`, `PAGE_CAPABILITY_REQUIREMENTS`, and `capabilitiesForMode(mode)`.
- Produces: coverage manifest schema version 1 with `releaseEnabled`, `presetVersion`, and classified `tables`, `rpcs`, `edgeFunctions`, `storage`, `imports`, `offlineOperations`, `backgroundJobs`, `exports`, `reports`, and `pages` arrays.
- Produces: `npm run check:capability-coverage`.

- [ ] **Step 1: Write catalog and validator tests that fail before the files exist**

```ts
expect(Object.keys(OPERATING_MODE_PRESETS)).toEqual(["fabrication_only", "erection_only", "combined"]);
expect(OPERATING_MODE_PRESETS.erection_only).not.toContain("fabrication_operations");
expect(OPERATING_MODE_PRESETS.erection_only).toContain("piece_logistics");
expect(validateCoverage({ ...valid, unknownCapability: "x" })).toThrow(/unknown capability/i);
expect(validateCoverage({ ...valid, releaseEnabled: true, unclassifiedWrites: ["rpc:x"] })).toThrow(/unclassified/i);
```

- [ ] **Step 2: Run the focused tests and verify missing-module failures**

Run: `npx vitest run src/config/__tests__/companyCapabilities.test.ts scripts/__tests__/companyCapabilityCoverage.test.mjs`

Expected: FAIL because the catalog, manifest, and validator do not exist.

- [ ] **Step 3: Implement the exact catalog and version-1 preset matrix from the spec**

Keep page requirements separate from authorization: each page maps to zero or more capabilities for rendering only. Mixed pages identify individual panel requirements instead of receiving a single broad page capability.

- [ ] **Step 4: Build the coverage manifest from current repository inventory**

Classify all currently exported tables, owned/live Edge Function slugs, offline operation types, storage buckets/path contracts, mutating imports, public RPCs, scheduled jobs, and registered pages. Every item records `capability`, `accessKind`, `enforcement` (`existing`, `planned`, or `not_applicable`), and `historicalCutoff` (`created_at`, owning-record reference, or `unsupported`). Set `releaseEnabled` to `false`.

- [ ] **Step 5: Implement the validator and wire it into required CI**

The validator cross-checks `PROJECT_EXPORT_TABLES`, `production-ownership-manifest.json`, field outbox operation constants, and `PAGES`/module registry. While `releaseEnabled=false`, planned entries are allowed but unclassified entries are not. With `releaseEnabled=true`, every write/export/replay surface for a disabled preset must be `existing`.

- [ ] **Step 6: Run focused and repository checks**

Run: `npm run check:capability-coverage && npx vitest run src/config/__tests__/companyCapabilities.test.ts scripts/__tests__/companyCapabilityCoverage.test.mjs`

Expected: PASS with every current surface classified and release still disabled.

- [ ] **Step 7: Commit**

```bash
git add src/config/companyCapabilities.ts src/config/__tests__/companyCapabilities.test.ts supabase/company-capability-coverage.json scripts/validate-company-capability-coverage.mjs scripts/__tests__/companyCapabilityCoverage.test.mjs package.json .github/workflows/ci.yml
git commit -m "security: classify company capability surfaces"
```

### Task 2: Private capability state, presets, audit, and bootstrap

**Files:**
- Create via CLI: `supabase/migrations/{generated_version}_company_capability_foundation.sql`
- Create: `supabase/migrations/__tests__/companyCapabilityFoundation.test.ts`
- Create: `supabase/tests/company-capabilities/package.json`
- Create: `supabase/tests/company-capabilities/package-lock.json`
- Create: `supabase/tests/company-capabilities/fixture.mjs`
- Create: `supabase/tests/company-capabilities/foundation.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces private tables `organization_operating_modes`, `organization_capability_state`, and singleton `company_capability_release_state`.
- Produces append-only `public.organization_capability_events` with explicit RLS/grants.
- Produces private preset resolver `private.company_capabilities_for_mode(text, integer)`.
- Produces public invoker RPCs `get_my_organization_capabilities(uuid)` and `set_organization_operating_mode(uuid,text,bigint,text)` backed by private definer implementations.
- Produces `create_organization_with_mode(text,text,text)` while preserving `create_organization(text,text)` as an atomic combined-mode compatibility wrapper.

- [ ] **Step 1: Generate the migration path with the CLI**

Run: `supabase migration new company_capability_foundation`

Expected: one new timestamped file whose suffix is `_company_capability_foundation.sql`; record that exact path in the tests.

- [ ] **Step 2: Write failing static and PGlite foundation tests**

```js
assert.equal((await snapshot(ids.existingOrg)).operating_mode, "combined");
assert.deepEqual((await snapshot(ids.existingOrg)).capabilities.fabrication_operations, { enabled: true, disabled_at: null });
await assert.rejects(setMode(ids.org, "erection_only", 1, "test"), /release_disabled/);
assert.equal(await canDirectlyUpdatePrivateState(), false);
assert.equal(await canOrdinaryMemberReadAudit(), false);
```

Also assert empty search paths, schema-qualified bodies, explicit revokes/grants, immutable event guards, unique complete state rows, and `release_enabled=false`.
Assert each event captures actor, request correlation id, reason, prior/new revision, prior/new mode, and complete prior/new capability documents.

- [ ] **Step 3: Run tests and verify the missing migration contract fails**

Run: `npx vitest run supabase/migrations/__tests__/companyCapabilityFoundation.test.ts && npm test --prefix supabase/tests/company-capabilities`

Expected: FAIL on absent tables/functions.

- [ ] **Step 4: Implement the private schema state and atomic backfill**

Backfill every existing org to combined preset version 1 in the same migration. Use text plus `CHECK` constraints, `timestamptz`, composite keys, indexed FK/policy columns, private-table RLS defense in depth, and no direct app-role table privileges.

- [ ] **Step 5: Implement invoker wrappers and private definer functions**

Private bodies require live `auth.uid()`, current membership, owner/admin for mutation, `steelbuild_security.satisfies_mfa()`, expected revision, nonblank reason, known mode/version, and release enabled for any non-combined change. They update state and append the event in one transaction.

- [ ] **Step 6: Preserve organization creation and erasure**

Make both creation RPCs create complete capability state atomically. Update current `reset_org_data` and `hard_delete_organization` definitions so mode/state/events are included without bypassing their reviewed trigger-suppression and erasure audit behavior.

- [ ] **Step 7: Run foundation verification**

Run: `npx vitest run supabase/migrations/__tests__/companyCapabilityFoundation.test.ts supabase/migrations/__tests__/hardDeleteOrganizationCursorAndNoteFolders.test.ts supabase/migrations/__tests__/restrictSecurityDefinerExecution.test.js && npm test --prefix supabase/tests/company-capabilities`

Expected: PASS, including rerun/idempotency and direct privilege denial checks.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/{generated_version}_company_capability_foundation.sql supabase/migrations/__tests__/companyCapabilityFoundation.test.ts supabase/tests/company-capabilities .github/workflows/ci.yml
git commit -m "security: add company capability state"
```

### Task 3: Capability decisions and historical cutoffs

**Files:**
- Create via CLI: `supabase/migrations/{generated_version}_company_capability_authorization.sql`
- Create: `supabase/migrations/__tests__/companyCapabilityAuthorization.test.ts`
- Create: `supabase/tests/company-capabilities/authorization.mjs`
- Modify: `supabase/tests/company-capabilities/package.json`

**Interfaces:**
- Produces private helpers `org_capability_decision(uuid,text,text,timestamptz)` and `project_capability_decision(uuid,text,text,timestamptz)`.
- Produces public invoker wrapper `authorize_project_capability(uuid,text,text,timestamptz)` returning `{allowed, reason, org_id, capability_revision, disabled_at}` from a private definer implementation.
- Consumes: version-1 state and preset definitions from Task 2.

- [ ] **Step 1: Generate the authorization migration**

Run: `supabase migration new company_capability_authorization`

- [ ] **Step 2: Write the negative matrix first**

```js
assert.deepEqual(await decision({ actor: ids.outsider, project: ids.project, capability: "fabrication_operations", access: "read" }), denied("membership_required"));
assert.deepEqual(await decision({ actor: ids.removed, project: ids.archived, capability: "fabrication_operations", access: "read" }), denied("membership_required"));
assert.deepEqual(await decision({ state: "missing" }), denied("capability_configuration_incomplete"));
assert.deepEqual(await decision({ capability: "unknown" }), denied("capability_configuration_incomplete"));
assert.equal((await decision({ access: "write", enabled: false })).reason, "capability_disabled");
assert.equal((await decision({ access: "read", createdAt: beforeCutoff, enabled: false })).allowed, true);
assert.equal((await decision({ access: "read", createdAt: afterCutoff, enabled: false })).reason, "historical_cutoff_exceeded");
```

Include viewer/field/PM/admin/owner, two orgs, two projects per org, archived projects, null timestamps, re-enable/re-disable, stale revision, and missing identity.

- [ ] **Step 3: Run the authorization package and verify failure**

Run: `npm test --prefix supabase/tests/company-capabilities`

Expected: FAIL because decision helpers do not exist.

- [ ] **Step 4: Implement fail-closed decision helpers**

Resolve owning org from the project, require current membership and existing project-role helpers, validate known access kinds (`read`, `write`, `export`, `share`), and apply the current disable cutoff only to read/export. Return stable reason codes without revealing unauthorized resource existence.

- [ ] **Step 5: Verify query shape and privileges**

Assert `(select auth.uid())`/initplan-friendly lookups, indexed leading columns, empty search paths for definers, wrapper-only Data API exposure, and no execute privilege for `anon` or unrelated private helpers.

- [ ] **Step 6: Run focused verification and advisors against local Supabase when available**

Run: `npm test --prefix supabase/tests/company-capabilities && npx vitest run supabase/migrations/__tests__/companyCapabilityAuthorization.test.ts`

Then, if local API/DB/Auth are running: execute the migration in a rollback transaction, run representative decision queries, and run the available database advisor command discovered through `supabase db --help`.

Expected: all matrix checks pass; no security/performance advisor finding caused by the new objects.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/{generated_version}_company_capability_authorization.sql supabase/migrations/__tests__/companyCapabilityAuthorization.test.ts supabase/tests/company-capabilities
git commit -m "security: enforce company capability decisions"
```

### Task 4: Typed client snapshot and cache isolation

**Files:**
- Create: `src/lib/org/capabilities.ts`
- Create: `src/hooks/useCompanyCapabilities.ts`
- Create: `src/hooks/__tests__/useCompanyCapabilities.test.tsx`
- Modify: `src/lib/org/repository.ts`
- Modify: `src/components/shared/OrgContext.jsx`
- Modify: `src/components/shared/__tests__/OrgContext.isolation.test.tsx`

**Interfaces:**
- Produces `getMyOrganizationCapabilities(orgId)`, `setOrganizationOperatingMode(input)`, `useCompanyCapabilities()`, `hasCapability(key, accessKind?)`, and `capabilityForPage(page)`.
- Consumes catalog types from Task 1 and RPC result from Tasks 2–3.

- [ ] **Step 1: Write failing snapshot and isolation tests**

```ts
expect(result.current.snapshot?.operatingMode).toBe("erection_only");
expect(result.current.hasCapability("fabrication_operations")).toBe(false);
expect(queryKeysAfterOrgSwitch).not.toContainEqual(["company-capabilities", "user-a", "org-a"]);
expect(result.current.hasCapability("unknown" as CapabilityKey)).toBe(false);
```

Also simulate membership removal and an RPC `capability_configuration_incomplete` result; cached state must be cleared and the hook must not fail open.

- [ ] **Step 2: Run tests and verify missing client APIs**

Run: `npx vitest run src/hooks/__tests__/useCompanyCapabilities.test.tsx src/components/shared/__tests__/OrgContext.isolation.test.tsx`

- [ ] **Step 3: Implement repository mapping and query keys**

Validate the complete server payload against the catalog before publishing it. Query keys include user id and org id; auth/org changes remove old workspace queries. Do not derive authority from local storage, org metadata, or feature flags.

- [ ] **Step 4: Expose read-only capability state through OrgContext**

OrgContext may expose snapshot/loading/error/refetch for consumers, but must preserve its existing workspace isolation and cannot change the current server authority semantics.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/hooks/__tests__/useCompanyCapabilities.test.tsx src/components/shared/__tests__/OrgContext.isolation.test.tsx`

```bash
git add src/lib/org/capabilities.ts src/hooks/useCompanyCapabilities.ts src/hooks/__tests__/useCompanyCapabilities.test.tsx src/lib/org/repository.ts src/components/shared/OrgContext.jsx src/components/shared/__tests__/OrgContext.isolation.test.tsx
git commit -m "feat: load company capability snapshots"
```

## Phase B — Server enforcement before UI exposure

### Task 5: Fabrication, release, and procurement enforcement

**Files:**
- Create via CLI: `supabase/migrations/{generated_version}_enforce_fabrication_company_capabilities.sql`
- Create: `supabase/migrations/__tests__/fabricationCompanyCapabilities.test.ts`
- Create: `supabase/tests/company-capabilities/fabrication.mjs`
- Modify: `supabase/tests/company-capabilities/package.json`
- Modify: `supabase/company-capability-coverage.json`

**Interfaces:**
- Consumes `private.project_capability_decision` from Task 3.
- Produces restrictive per-command RLS policies and transactional guards for every manifest entry classified as `fabrication_operations`, `fabrication_release`, or `procurement_control`.
- Produces same-company `get_project_piece_logistics(uuid)` invoker wrapper/private projection for erection-safe piece reads.

- [ ] **Step 1: Generate the migration and write direct-request failures first**

For every classified table/RPC, test REST-equivalent select/insert/update/delete or direct function invocation. Representative assertions:

```js
assert.equal(await directSelect("piece_station_completions", erectionActor), 0);
await assert.rejects(() => rpc("advance_piece_station", erectionActor), sqlState("42501", "capability_disabled"));
await assert.rejects(() => rpc("apply_piece_import_batch", erectionActor), sqlState("42501", "capability_disabled"));
assert.deepEqual(Object.keys(await pieceLogistics(erectionActor)), SAFE_LOGISTICS_COLUMNS);
assert.equal("actual_hours" in await pieceLogistics(erectionActor), false);
```

- [ ] **Step 2: Run the package and confirm erection-only requests currently succeed or leak fields**

Run: `npm test --prefix supabase/tests/company-capabilities`

- [ ] **Step 3: Add restrictive command-specific policies and definer guards**

Use separate `SELECT`, `INSERT`, `UPDATE`, and `DELETE` restrictive policies so historical reads do not permit writes. Add explicit checks inside definer RPCs immediately before mutation. Do not weaken existing role, immutability, fab-release, project, or MFA checks.

- [ ] **Step 4: Add the curated logistics projection**

Return only the spec's allowlisted piece/package/shipment/delivery fields. Never use `select *`, and deny unknown/foreign projects before revealing whether a mark exists.

- [ ] **Step 5: Mark manifest enforcement complete and verify**

Run: `npm test --prefix supabase/tests/company-capabilities && npm run check:capability-coverage && npx vitest run supabase/migrations/__tests__/fabricationCompanyCapabilities.test.ts`

Expected: combined/fabrication behavior remains valid; erection-only private fabrication direct requests fail; safe logistics reads pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/{generated_version}_enforce_fabrication_company_capabilities.sql supabase/migrations/__tests__/fabricationCompanyCapabilities.test.ts supabase/tests/company-capabilities supabase/company-capability-coverage.json
git commit -m "security: enforce fabrication company capabilities"
```

### Task 6: Erection, field quality, and safety enforcement

**Files:**
- Create via CLI: `supabase/migrations/{generated_version}_enforce_erection_company_capabilities.sql`
- Create: `supabase/migrations/__tests__/erectionCompanyCapabilities.test.ts`
- Create: `supabase/tests/company-capabilities/erection.mjs`
- Modify: `supabase/tests/company-capabilities/package.json`
- Modify: `supabase/company-capability-coverage.json`

**Interfaces:**
- Produces restrictive per-command RLS and RPC guards for all `erection_operations` and `field_quality_safety` manifest entries.
- Preserves `shop_quality` independently from field quality/safety.

- [ ] **Step 1: Generate the migration and write the negative tests**

```js
await assert.rejects(() => insert("daily_logs", fabricationActor), capabilityDisabled);
await assert.rejects(() => insert("safety_incidents", fabricationActor), capabilityDisabled);
assert.equal(await selectHistorical("daily_logs", fabricationActor, beforeCutoff), 1);
assert.equal(await selectHistorical("daily_logs", removedActor, beforeCutoff), 0);
assert.equal(await select("quality_control_records", fabricationActor, { domain: "shop" }), 1);
```

Exercise viewer/field/PM/admin roles, archived projects, post-cutoff rows, and direct RPC/API calls.

- [ ] **Step 2: Run the tests to reproduce missing capability enforcement**

Run: `npm test --prefix supabase/tests/company-capabilities`

- [ ] **Step 3: Implement restrictive policies and transactional guards**

Keep existing field role floors. If a table mixes shop and field quality, add an immutable domain discriminator/backfill or split safe views before applying policy; do not infer domain from UI route or free text.

- [ ] **Step 4: Update the manifest and verify**

Run: `npm test --prefix supabase/tests/company-capabilities && npm run check:capability-coverage && npx vitest run supabase/migrations/__tests__/erectionCompanyCapabilities.test.ts`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/{generated_version}_enforce_erection_company_capabilities.sql supabase/migrations/__tests__/erectionCompanyCapabilities.test.ts supabase/tests/company-capabilities supabase/company-capability-coverage.json
git commit -m "security: enforce erection company capabilities"
```

### Task 7: Edge, storage, import, background, and derived-read boundaries

**Files:**
- Create: `supabase/functions/_shared/capabilityAuthorization.ts`
- Create: `supabase/functions/_shared/capabilityAuthorization.test.ts`
- Modify: capability-protected Edge Functions listed in `supabase/company-capability-coverage.json`
- Modify: matching function authorization tests
- Create via CLI: `supabase/migrations/{generated_version}_enforce_storage_company_capabilities.sql`
- Create: `supabase/migrations/__tests__/storageCompanyCapabilities.test.ts`
- Modify: report/query/LLM aggregation files listed in `supabase/company-capability-coverage.json`
- Modify: matching aggregation tests
- Modify: `supabase/company-capability-coverage.json`

**Interfaces:**
- Produces `authorizeProjectCapability(request, {projectId, capability, accessKind, resourceCreatedAt?}, config)` returning the server decision or a stable denial response.
- Produces `SystemCapabilityContext` validation for approved non-human jobs: `{jobKind, orgId, projectId, capability, correlationId}`.

- [ ] **Step 1: Generate the storage enforcement migration**

Run: `supabase migration new enforce_storage_company_capabilities`

- [ ] **Step 2: Write shared-helper and race tests before integration**

```ts
expect(await authorizeProjectCapability(request, input, config)).toMatchObject({ allowed: true, capability_revision: 7 });
expect(await authorizeProjectCapability(request, disabledInput, config)).toEqual(response(403, "capability_disabled"));
expect(await authorizeProjectCapability(request, missingConfig, config)).toEqual(response(503, "capability_configuration_incomplete"));
expect(serviceActionAfterModeChange).toEqual({ status: "skipped", reason: "capability_disabled" });
```

Assert caller JWT and publishable/anon key—not service credentials—perform the decision request.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npx vitest run supabase/functions/_shared/capabilityAuthorization.test.ts supabase/functions`

- [ ] **Step 4: Implement the shared helper and integrate manifest-listed functions**

Authorize before uploads, service-role reads/writes, external calls, or job enqueue. Recheck at the database mutation. Preserve MFA, project role, origin, quota, idempotency, and audit gates.

- [ ] **Step 5: Add storage restrictions and owning-record classification**

Storage reads/writes resolve the owning database row and capability; path text alone is insufficient. Upsert paths retain required insert/select/update policies. Historical downloads use the owning record cutoff.

- [ ] **Step 6: Classify imports, background jobs, and derived reads**

Bulk/CSV/data-exchange paths and scheduled jobs use the same capability key. A disabled job records only ids/reason/revision/correlation id and never payload contents. Unknown job kinds fail closed. Reports, dashboards, search aggregators, generated documents, and LLM prompt builders filter each source domain independently; `reporting` never widens access to an underlying disabled domain.

- [ ] **Step 7: Verify Edge, SQL, aggregation, and manifest checks**

Run: `npx vitest run supabase/functions supabase/migrations/__tests__/storageCompanyCapabilities.test.ts && npm run check:capability-coverage`

Run the repository's Deno Edge typecheck command from `.github/workflows/ci.yml` against every modified function.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions supabase/migrations/{generated_version}_enforce_storage_company_capabilities.sql supabase/migrations/__tests__/storageCompanyCapabilities.test.ts supabase/company-capability-coverage.json
git commit -m "security: enforce capability service boundaries"
```

### Task 8: Capability-aware project export

**Files:**
- Modify: `supabase/functions/project-export/exportShape.ts`
- Modify: `supabase/functions/project-export/index.ts`
- Modify: `supabase/functions/project-export/index.test.ts`
- Modify: `src/lib/workspaceExport.ts`
- Modify: `src/services/projectExportService.ts`
- Modify: `scripts/staging-backend-acceptance/acceptance.ts`
- Modify: `supabase/tests/membership-revocation/export-audit.ts`
- Modify: `supabase/company-capability-coverage.json`

**Interfaces:**
- Produces request `mode: "full" | "authorized_subset"`.
- Produces envelope fields `capability_revision`, `included_domains`, and `omitted_domains`.
- Consumes table/storage classification from Task 1 and authorization helper from Task 7.

- [ ] **Step 1: Write export denial and omission tests**

```ts
expect(await exportProject({ mode: "full", disabledDomains: ["fabrication_operations"] })).toMatchObject({ status: 409, code: "full_export_not_authorized" });
expect(await exportProject({ mode: "authorized_subset" })).toMatchObject({ included_domains: expect.any(Array), omitted_domains: ["fabrication_operations"] });
expect(exportedTables).not.toContain("piece_station_completions");
expect(audit.metadata).toMatchObject({ capability_revision: 7, requested_mode: "authorized_subset" });
```

- [ ] **Step 2: Run export tests and reproduce unconditional export behavior**

Run: `npx vitest run supabase/functions/project-export/index.test.ts && npm test --prefix supabase/tests/membership-revocation`

- [ ] **Step 3: Replace unconditional iteration with classified selection**

Authorize every domain, table, note folder projection, and storage manifest entry. Apply historical cutoffs per row. Abort on a read error; never label a failed table as an intentional omission.

- [ ] **Step 4: Make the user choose full or subset explicitly**

Update workspace export callers and copy. Preserve the existing mandatory caller-attributed final audit and ensure revocation during export still prevents contents from returning.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run supabase/functions/project-export/index.test.ts scripts/__tests__/stagingBackendAcceptance.test.ts && npm test --prefix supabase/tests/membership-revocation && npm run check:capability-coverage`

```bash
git add supabase/functions/project-export src/lib/workspaceExport.ts src/services/projectExportService.ts scripts/staging-backend-acceptance/acceptance.ts supabase/tests/membership-revocation/export-audit.ts supabase/company-capability-coverage.json
git commit -m "security: scope exports by company capability"
```

### Task 9: Offline replay denial and recoverable drafts

**Files:**
- Create via CLI: `supabase/migrations/{generated_version}_enforce_offline_company_capabilities.sql`
- Create: `supabase/migrations/__tests__/offlineCompanyCapabilities.test.ts`
- Reference only: `supabase/migrations/20260802090500_planner_offline_idempotency.sql` (replace its function only through the new forward migration; never edit this applied file)
- Modify: `src/lib/field/replayClient.ts`
- Modify: `src/lib/field/offlineQueue.js`
- Modify: `src/lib/field/OutboxContext.jsx`
- Modify: `src/lib/field/__tests__/offlineQueue.test.js`
- Modify: `src/lib/field/__tests__/OutboxContext.transport.test.tsx`
- Modify: `supabase/tests/company-capabilities/offline.mjs`
- Modify: `supabase/company-capability-coverage.json`

**Interfaces:**
- Produces replay failure shape `{kind:"permanent", code:"capability_disabled", message:string, exportableDraft:true}`.
- Preserves stored results for already-applied idempotency receipts without reapplying mutations.

- [ ] **Step 1: Generate the migration and write replay-race tests**

```js
const queued = enqueueWhileEnabled();
await disable("erection_operations");
expect(await replay(queued)).toMatchObject({ kind: "permanent", code: "capability_disabled", exportableDraft: true });
expect(await countAppliedRows()).toBe(0);
expect(await replay(completedReceiptAfterDisable)).toEqual(previousStoredResult);
expect(await replayAsRemovedMember(queued)).toMatchObject({ code: "membership_required" });
```

- [ ] **Step 2: Run SQL and UI tests to reproduce retry/silent-sync risks**

Run: `npm test --prefix supabase/tests/company-capabilities && npx vitest run src/lib/field/__tests__/offlineQueue.test.js src/lib/field/__tests__/OutboxContext.transport.test.tsx`

- [ ] **Step 3: Recheck capability inside replay transactions**

Bind receipt identity/project/payload first. Return an existing completed receipt. For new application, recheck current membership/role/capability immediately before mutation and create no receipt for denied work.

- [ ] **Step 4: Preserve denied local drafts**

Teach queue reconciliation to stop automatic retries for stable authorization denials while retaining the operation and any photo blob for user export/discard. Identity changes must not expose another user's draft.

- [ ] **Step 5: Verify and commit**

Run: `npm test --prefix supabase/tests/company-capabilities && npx vitest run src/lib/field/__tests__/offlineQueue.test.js src/lib/field/__tests__/OutboxContext.transport.test.tsx supabase/migrations/__tests__/offlineCompanyCapabilities.test.ts && npm run check:capability-coverage`

```bash
git add supabase/migrations/{generated_version}_enforce_offline_company_capabilities.sql supabase/migrations/__tests__/offlineCompanyCapabilities.test.ts supabase/tests/company-capabilities src/lib/field supabase/company-capability-coverage.json
git commit -m "security: recheck capabilities during offline replay"
```

## Phase C — Product configuration and explicit sharing

### Task 10: Onboarding, admin mode control, navigation, and route UX

**Files:**
- Create: `src/components/settings/CompanyOperatingModePanel.tsx`
- Create: `src/components/settings/__tests__/CompanyOperatingModePanel.test.tsx`
- Create: `src/components/onboarding/CompanyModePicker.tsx`
- Create: `src/components/onboarding/__tests__/CompanyModePicker.test.tsx`
- Create: `src/components/shared/CompanyCapabilityNotice.tsx`
- Create: `src/components/shared/__tests__/CompanyCapabilityNotice.test.tsx`
- Modify: `src/pages/OrgOnboarding.jsx`
- Modify: `src/pages/Settings.jsx`
- Modify: `src/boot/AppRoutes.jsx`
- Modify: `src/boot/__tests__/AppRoutes.unknown.test.tsx`
- Modify: `src/hooks/useModuleAccess.js`
- Modify: `src/config/moduleRegistry.js`
- Modify: navigation derive/component tests under `src/components/nav/__tests__/`

**Interfaces:**
- Consumes `useCompanyCapabilities`, mode mutation, and page requirements from Tasks 1 and 4.
- Produces an admin-only company-mode settings tab and capability-aware page/nav rendering.

- [ ] **Step 1: Write UI authorization and usability tests first**

```tsx
expect(screen.queryByRole("button", { name: /change company mode/i })).not.toBeInTheDocument(); // member
expect(screen.getByRole("button", { name: /change company mode/i })).toBeInTheDocument(); // admin
expect(screen.getByText(/existing fabrication records remain read-only/i)).toBeInTheDocument();
expect(directDisabledRoute()).toRender("This company has fabrication operations disabled");
expect(erectionNav()).not.toContain("Fab Release");
expect(erectionNav()).toContain("Deliveries");
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/components/settings/__tests__/CompanyOperatingModePanel.test.tsx src/components/onboarding/__tests__/CompanyModePicker.test.tsx src/boot/__tests__/AppRoutes.unknown.test.tsx src/components/nav/__tests__`

- [ ] **Step 3: Add explicit onboarding selection**

Default visibly to combined. Submit through `create_organization_with_mode`; do not create then patch. Explain fabrication-only, erection-only, and combined using retained workflows from the spec.

- [ ] **Step 4: Add owner/admin settings mutation**

Require reason, expected revision, MFA-satisfied session, and a confirmation summary. Surface `revision_conflict`, `mfa_required`, and release-disabled states. Invalidate snapshot and domain queries on success.

- [ ] **Step 5: Compose rollout flags with company capabilities**

Existing feature flags still decide rollout visibility. Company capability requirements further narrow pages/panels. A direct disabled route renders `CompanyCapabilityNotice`; loading never flashes a prohibited page. Mixed pages gate their panels, not the whole route.

- [ ] **Step 6: Keep selector dark before cutover**

The settings panel reports “not yet available” while the server release state is false, even if a user invokes the route directly. This is a release safety state, not an authorization substitute.

- [ ] **Step 7: Verify and commit**

Run: `npx vitest run src/components/settings/__tests__/CompanyOperatingModePanel.test.tsx src/components/onboarding/__tests__/CompanyModePicker.test.tsx src/boot/__tests__/AppRoutes.unknown.test.tsx src/components/nav/__tests__ src/config/__tests__/moduleRegistry.structure.test.ts && npm run check:capability-coverage`

```bash
git add src/components/settings/CompanyOperatingModePanel.tsx src/components/settings/__tests__/CompanyOperatingModePanel.test.tsx src/components/onboarding src/components/shared/CompanyCapabilityNotice.tsx src/components/shared/__tests__/CompanyCapabilityNotice.test.tsx src/pages/OrgOnboarding.jsx src/pages/Settings.jsx src/boot/AppRoutes.jsx src/boot/__tests__/AppRoutes.unknown.test.tsx src/hooks/useModuleAccess.js src/config/moduleRegistry.js src/components/nav
git commit -m "feat: add company operating mode controls"
```

### Task 11: Typed intercompany delivery/logistics grants

**Files:**
- Create via CLI: `supabase/migrations/{generated_version}_intercompany_logistics_grants.sql`
- Create: `supabase/migrations/__tests__/intercompanyLogisticsGrants.test.ts`
- Create: `supabase/tests/company-capabilities/intercompany.mjs`
- Modify: `supabase/tests/company-capabilities/package.json`
- Modify: `supabase/company-capability-coverage.json`

**Interfaces:**
- Produces private envelope `intercompany_project_grants` linking owner org/project to distinct grantee org/project.
- Produces typed delivery/logistics child grants and immutable grant events.
- Produces invoker wrappers `create_intercompany_logistics_grant`, `revoke_intercompany_logistics_grant`, and `get_granted_piece_logistics` backed by private definer implementations.

- [ ] **Step 1: Generate the migration and write grant abuse tests first**

```js
await assert.rejects(() => readSupplierProject(vendorRelationshipOnly), /intercompany_grant_required/);
await assert.rejects(() => createGrant(nonOwnerAdmin), /role_insufficient/);
await assert.rejects(() => createGrant({ ownerProject: otherOrgProject }), /scope_mismatch/);
expect(await grantedRows(expiredGrant)).toHaveLength(0);
expect(await grantedRows(revokedGrant)).toHaveLength(0);
expect(await grantedRows(validGrant)).toEqual([SAFE_LOGISTICS_ROW]);
expect(Object.keys((await grantedRows(validGrant))[0])).not.toContain("actual_hours");
```

Cover wrong company, wrong owner/grantee project, wrong resource, forged ids, removed grantee member, insufficient grantee-project role, disabled owner/grantee capability, expiry, revocation, archive, and MFA.

- [ ] **Step 2: Run the package and verify all relationship-only requests fail for the wrong reason or leak today**

Run: `npm test --prefix supabase/tests/company-capabilities`

- [ ] **Step 3: Implement typed grants and immutable events**

Use FK-backed child rows, distinct-org checks, project/org consistency constraints, indexed expiry/revocation lookups, explicit read-only permission, expected revision on revoke, and no generic polymorphic UUID scope.

- [ ] **Step 4: Implement the curated projection**

Require current grantee-org membership, current linked grantee-project access/role, enabled capability on both sides, and a live grant. Return only explicit logistics columns.

- [ ] **Step 5: Verify and commit**

Run: `npm test --prefix supabase/tests/company-capabilities && npx vitest run supabase/migrations/__tests__/intercompanyLogisticsGrants.test.ts && npm run check:capability-coverage`

```bash
git add supabase/migrations/{generated_version}_intercompany_logistics_grants.sql supabase/migrations/__tests__/intercompanyLogisticsGrants.test.ts supabase/tests/company-capabilities supabase/company-capability-coverage.json
git commit -m "security: add scoped intercompany logistics grants"
```

### Task 12: Erection-safe piece and delivery experience

**Files:**
- Create: `src/lib/pieceControl/logisticsRepository.ts`
- Create: `src/lib/pieceControl/__tests__/logisticsRepository.test.ts`
- Create: `src/components/pieceControl/ErectionLogisticsRegister.tsx`
- Create: `src/components/pieceControl/__tests__/ErectionLogisticsRegister.test.tsx`
- Modify: `src/pages/PieceRegister.tsx`
- Modify: Piece Register page tests under `src/pages/pieceRegister/__tests__/`
- Modify: `src/pages/Deliveries.tsx`
- Modify: `src/pages/deliveries/__tests__/DeliveryControlCenter.render.test.tsx`

**Interfaces:**
- Consumes owned/granted logistics projections from Tasks 5 and 11.
- Produces one erection-safe register model; it never accepts or renders private fabrication fields.

- [ ] **Step 1: Write mixed-page data-routing tests**

```tsx
expect(erectionQueries).toEqual(["get_project_piece_logistics", "get_granted_piece_logistics"]);
expect(erectionQueries).not.toContain("pieces.select(*)");
expect(screen.queryByText(/station progress|budget hours|actual hours/i)).not.toBeInTheDocument();
expect(screen.getByText("B12")).toBeInTheDocument();
expect(screen.getByText(/grant expired/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run focused tests and verify current Piece Register loads private fabrication data**

Run: `npx vitest run src/lib/pieceControl/__tests__/logisticsRepository.test.ts src/components/pieceControl/__tests__/ErectionLogisticsRegister.test.tsx src/pages/pieceRegister/__tests__/*`

- [ ] **Step 3: Implement projection-only repository and view**

Normalize owned and granted rows into an explicit `LogisticsPieceRow` type. Render packages, marks, shortage/hold, shipment/delivery/receipt, issued drawing ids, and source company. Do not pass through unknown keys.

- [ ] **Step 4: Route mixed pages by capabilities**

Combined/fabrication users retain the canonical Piece Register. Erection-only users receive `ErectionLogisticsRegister`; import, station, release, labor, cost, relationship mutation, and private notes controls are absent. Deliveries compose owned and granted safe rows without broad vendor access.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/lib/pieceControl/__tests__/logisticsRepository.test.ts src/components/pieceControl/__tests__/ErectionLogisticsRegister.test.tsx src/pages/pieceRegister/__tests__/* && npm run check:capability-coverage`

```bash
git add src/lib/pieceControl/logisticsRepository.ts src/lib/pieceControl/__tests__/logisticsRepository.test.ts src/components/pieceControl/ErectionLogisticsRegister.tsx src/components/pieceControl/__tests__/ErectionLogisticsRegister.test.tsx src/pages/PieceRegister.tsx src/pages/pieceRegister src/pages/Deliveries.tsx src/pages/deliveries/__tests__/DeliveryControlCenter.render.test.tsx
git commit -m "feat: add erection-safe logistics views"
```

## Phase D — Cutover, hosted acceptance, and release

### Task 13: Synthetic acceptance, cutover gate, and release runbook

**Files:**
- Create: `e2e/company-capability-modes.spec.ts`
- Modify: `scripts/staging-backend-acceptance/acceptance.ts`
- Modify: `scripts/__tests__/stagingBackendAcceptance.test.ts`
- Create: `docs/runbooks/company-capability-release.md`
- Modify: `ARCHITECTURE.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `TECH_DEBT.md`
- Create via CLI after local coverage and release gates are green: `supabase/migrations/{generated_version}_enable_company_capability_modes.sql`
- Create: `supabase/migrations/__tests__/enableCompanyCapabilityModes.test.ts`
- Modify: `supabase/company-capability-coverage.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces hosted acceptance for two orgs × two projects, five project roles, removed users, archived projects, direct API/RPC, export/download, offline replay, and live/revoked/expired grants.
- Produces the separate release-enabling migration; it changes only reviewed release state after proving manifest completeness.

- [ ] **Step 1: Write release-gate tests before enabling anything**

```ts
expect(enableMigration).toRequire("coverage_version", manifest.version);
expect(enableMigration).toAbortWhen("planned enforcement remains");
expect(stagingMatrix).toContainAllRoles(["viewer", "field", "pm", "admin", "owner"]);
expect(stagingMatrix).toTest("direct requests independently of visible menus");
```

- [ ] **Step 2: Extend staging bootstrap/acceptance with synthetic identities**

Create or reuse only staging-scoped synthetic accounts and data. Exercise positive and negative cases through browser, direct REST/RPC, Edge, Storage download/upload, full/subset export, and queued replay. Clean up through existing approved staging mechanisms.

- [ ] **Step 3: Write the manual release runbook**

List exact migration/function assets, hash/ledger queries, staging evidence, rollback decision points, production authorization checklist, and post-release probes. State the shared-database prohibition on push/repair/apply_migration and forbid ownership-manifest suppression.

Update `ARCHITECTURE.md`, `CLAUDE.md`, `README.md`, and `TECH_DEBT.md` with the final capability boundary, commands, current verified release state, and any remaining hosted/deployment debt. Keep source verification, staging application, and production application explicitly separate.

- [ ] **Step 4: Run local release verification before generating cutover**

Run:

```bash
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm run check:no-new-js
npm run check:capability-coverage
npm test
npm run test:e2e:foundation
npm run build
npm run perf:bundle
npm run supabase:drift
```

Also run all `supabase/tests/company-capabilities` checks, affected Edge Deno typechecks, commercial/concurrent PostgreSQL packages, secret scan, and staging acceptance commands from CI.

- [ ] **Step 5: Generate the cutover migration only after the manifest is complete**

Run: `supabase migration new enable_company_capability_modes`

The migration asserts the expected coverage/preset version and complete org state before setting private release state true. Update `releaseEnabled` in the manifest in the same commit. It does not alter business data or silently change any org from combined.

- [ ] **Step 6: Apply and verify staging manually**

Commit the migration file before stamping. Apply the exact reviewed SQL using the repository runbook, stamp the exact filename version, compare ledger statements/hash to the file, deploy matching Edge bundles with their existing JWT modes, then run the hosted matrix. Record source-verified, staging-applied, and production-applied states separately.

- [ ] **Step 7: Commit release assets**

```bash
git add e2e/company-capability-modes.spec.ts scripts/staging-backend-acceptance scripts/__tests__/stagingBackendAcceptance.test.ts docs/runbooks/company-capability-release.md ARCHITECTURE.md CLAUDE.md README.md TECH_DEBT.md supabase/migrations/{generated_version}_enable_company_capability_modes.sql supabase/migrations/__tests__/enableCompanyCapabilityModes.test.ts supabase/company-capability-coverage.json .github/workflows/ci.yml
git commit -m "test: gate company capability release"
```

### Task 14: Whole-branch verification and review handoff

**Files:**
- Modify: `AGENT_CLAIMS.md` only to release the existing claim after all implementation and verification are complete
- Modify: audit/release evidence document named by Task 13 if verification results require an evidence appendix

**Interfaces:**
- Consumes every prior task and produces a reviewable branch with no open claim.

- [ ] **Step 1: Rebase or merge latest `origin/main` according to current repository practice**

Resolve only conflicts in claimed files; preserve concurrent rows in `AGENT_CLAIMS.md` and unrelated user/agent changes.

- [ ] **Step 2: Run the complete verification suite from Task 13 on the final merge result**

Expected: every required local gate passes; hosted staging/production results are reported separately and never inferred from local results.

- [ ] **Step 3: Perform a fresh security review**

Review definer ownership/search paths/execute grants, RLS command coverage, service-role boundaries, historical timestamps, cross-org projections, export omissions, offline receipts, and logs for sensitive payloads. Resolve every blocking finding and rerun affected checks.

- [ ] **Step 4: Release the claim and commit**

```bash
git add AGENT_CLAIMS.md
git commit -m "docs: release company capability security claim"
```

- [ ] **Step 5: Push and prepare the PR summary**

Summarize the exact presets, server boundaries, tests/check counts, migration filenames/hashes, staging status, production status, remaining owner-authorized release actions, and rollback path. Attach the PR to the task after creation.
