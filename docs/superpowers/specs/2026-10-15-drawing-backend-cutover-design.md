# Reviewed drawing backend cutover

Date: 2026-10-15. Status: **proposed written design, awaiting user review**.
This is not a migration, implementation plan, staging acceptance result, or
production approval. No hosted mutation accompanies this document.

## Intent and authority

The owner requested atomic drawing operations and server-side protections,
staging tests, and an exact production change package for approval before
application. Success means a reviewed source change either commits its complete
set/sheet/revision/coordination result once, or changes none of those records.
Old clients, direct REST, imports and offline replay must not bypass that rule.

Production `kjrwqagyeswwoxpjkcko` remains read-only in this workstream until the
owner approves the final named changes and checksums. Staging is the existing
persistent branch `ndyfjffsulfbwpmwdmic`; no new paid project is needed.
Preserve the shared database and sibling application's legitimate operations.
Never use `supabase db push`, migration repair, branch merge/reset, or MCP
`apply_migration`. Do not alter the ownership manifest to dismiss pending work.

## Verified starting point

Inspection used `codex/detailing-production-repair`, source `11cbd5fb`, PR #554,
in `C:\Users\nlort\.codex\worktrees\detailing-production-repair\SteelBuild-Pro`.
The original OneDrive checkout is not the editing target. The repair source
already contains frontend containment, not a backend authorization boundary.

Read-only catalog comparison on October 15, approximately 19:04-19:08 UTC:

- Both environments lack `apply_drawing_set_revision(uuid,jsonb)` and
  `get_drawing_revision_sources(uuid,text[])`.
- Both contain `submittal_round_revision_evidence`. On the four inspected tables
  (`drawings`, `drawing_sets`, `drawing_revisions`, and that evidence table),
  all 141 column records, 45 constraints, 15 noninternal triggers including their
  function-definition hashes, 12 policies, and 72 table-grant records match.
- All 42 inspected public drawing/round functions match by
  `md5(pg_get_functiondef(...))`. This is focused parity, not whole-schema,
  Storage-policy, role-inheritance, Auth, secret, or provider parity.
- Production has 147 public tables and staging 144. The missing staging tables
  are `blueline_audit`, `blueline_documents`, and `blueline_revisions`.
  Do not replay unrelated migrations to erase that difference.
- Staging is reachable on PostgreSQL 17.6. Its historical branch workflow label
  is `MIGRATIONS_FAILED`; this does not describe the restored schema by itself.
- Authenticated has table-level INSERT/UPDATE on drawing source tables, so
  column revokes alone cannot close the bypass. Table-level TRUNCATE grants also
  exist; RLS row policies are not protection for TRUNCATE. No destructive probe
  was run. Actual inherited privileges must be inspected before implementation.
- The five required PR #554 checks passed at source `11cbd5fb`; the separate
  advisory dependency audit failed. Those results do not validate this design or
  any subsequent backend source.

The existing source candidate is
`supabase/candidates/drawing-set-revision-transaction.sql`, SHA-256
`562699f68482d6a3f85a2c6edd0719dadba3d5808460f36d188c594ef2d3fa06`.
It implements existing-set revisions and private receipts/observations only.
It does not create a new set atomically, protect all direct writers, provide
durable client recovery, or export its private observations. Preserve the old
quarantined migration untouched. Earlier isolated test evidence is not hosted
acceptance for the eventual cutover.

## Approach and alternatives

Recommended: additive, explicit atomic commands plus a coordinated database
privilege cutover and typed client adapters. Stage the entire compatible package
before enabling either upload path. Keep current frontend holds until its
backend capability and recovery checks succeed.

A client-only sequencing/compensation fix remains unsafe after connection loss,
revocation or competing writes. Per-sheet RPCs still need a durable batch and
finalization protocol to prevent a partial set header or lost removals; that
larger protocol is not justified while the bounded one-set transaction is viable.

## Product semantics and transaction contracts

Keep the documented set-per-revision workflow as the normal New Set operation:
a new distinct set name, new source sheets and initial revision history. Creating
a new set never silently adopts an old name, retires an old set, or claims that
prior approval applies. In-place revision is a separate explicit reviewed action,
not a fallback for duplicate names. No automatic submittal or release creation.

1. **Atomic new-set intake.** One command accepts a stable actor/request UUID,
   exact project identity, reviewed new-set header, explicit nonempty selected
   sheet roster, source snapshots and source-bound extraction. It creates the
   set, every accepted sheet, each initial current revision and the receipt in
   one transaction. Existing or deleted same-name sets and uniqueness races
   reject without adopting them. The command must not commit an empty shell or
   infer that an omitted PDF page was reviewed. New revisions start `received`;
   approval remains pending and is never copied from another record.
2. **Atomic existing-set revision.** Retain the candidate's explicit complete
   `same/revised/added/removed` roster, optimistic timestamps/current pointers,
   exact project routing, and coordination mapping. Missing rows do not mean
   removal. Existing captured source/evidence fields remain unchanged, including
   incomplete legacy rows. Unsupported cross-sheet topology, ambiguous tracking,
   reused codes, active holds on removed sheets and changed source snapshots
   fail the whole command. Preserve prior rounds, submittals and links.
3. **Authorization and bounds.** Both commands require a current Auth identity,
   workspace membership, project PM authority and the installed enrolled-MFA
   policy, rechecked after waits and before/after final writes. Reject archived
   or unavailable projects/sets under the current repository rules. Keep the
   candidate's ordered locks, READ COMMITTED requirement and bounded lock waits.
   No network/provider call runs while database locks are held. Start with the
   existing 250-sheet/source and 1 MiB request bounds; retain the candidate's
   history/coordination/observation bounds and measure the combined maximum in
   real PostgreSQL. Exceeding limits rejects without truncating or batching
   secretly. API statement deadlines and receipt lookup waits must also be
   bounded and tested; installation-time timeouts are not runtime protection.
4. **Source and extraction truth.** Accept only exact private project PDF paths
   and recheck Storage object identity/version/update/eTag snapshots under lock.
   Capture the snapshot before presenting that source for review, retain it
   through confirmation, and require fresh review if the object/page changes.
   Positive 1-based pages and explicit review are required. Browser validation
   checks the actual selected PDF's page range; database metadata alone neither
   parses PDF pages nor establishes immutable PDF bytes. Retain that limitation
   explicitly and verify readable bytes/pages in staging. Unknown extraction is
   NULL, not an empty inspected result. A changed page invalidates previously
   derived text, callouts and hyperlinks unless actually re-extracted for that
   exact source. Keep prior parent values as observations, never as invented
   historic revision provenance.

## Server-side write boundary

Inventory application writers, generic entity APIs, callable SECURITY DEFINER
functions, triggers, role membership and sibling callers before selecting exact
GRANT/REVOKE statements. The final release package must contain a per-operation
allow/deny matrix and exact signatures; a broad unaudited revoke is not ready.

- Remove application-role table-level INSERT/UPDATE authority where required,
  then grant only the demonstrated metadata UPDATE column allowlist. Explicitly
  remove TRUNCATE and other unnecessary dangerous privileges. Check PUBLIC,
  anon, authenticated, service_role and inherited grants; a column revoke cannot
  override a table grant. Preserve authorized SELECT and existing row scoping.
- Source file/page/code, sheet identity/routing, extraction, revision history,
  current pointers, supersession and approval authority belong to reviewed
  commands, not generic CRUD. A new column receives no automatic metadata grant.
  Metadata and viewer calibration changes must retain appropriate existing role
  rules; do not remove them just because they share a table with protected data.
- Inventory existing publication, holds, submittal workflow, locking, archive,
  erasure and trigger-driven count/audit operations. Preserve their legitimate
  effects with explicit command authority; revoke or replace unsafe callable
  entrypoints that would bypass the new boundary. Do not use a caller-set GUC,
  client flag, request JSON role, or UI visibility as authority.
- New privileged functions set an empty search_path, use qualified static SQL,
  strictly validate JSON keys/types and recheck live authorization. Revoke
  PUBLIC/anon execution and private-schema access explicitly. Private receipt
  tables are not writable/readable through generic service-role application
  calls. No dynamic SQL from request strings or user-editable JWT metadata.
- Old browser/native/sibling/offline source writes fail before mutation. The
  compatible client translates privilege/command denial into an update-required
  action; unchanged old clients may display their existing permission error.
  Never retry through a legacy split-write path. Stage sibling-compatible replacements or document
  an intentional maintenance window and owner acceptance before production.

Protect newly adopted PDF objects from ordinary application replacement/deletion
as well as protecting their database pointers. Inspect the existing Storage
policies before adding restrictive UPDATE/DELETE rules for exact project paths
recorded by a committed command. Adoption and its source lock must be atomic;
an adopted path remains protected after archival and must not become reusable
because a receipt is pruned. Keep the authority private, not user-set metadata.
Test Storage API upsert, replace, move and delete independently of table CRUD.
Do not revoke all app-files writes or automatically classify legacy/sibling
objects. Existing captured-evidence retention and authorized project erasure
must be reconciled explicitly. This protection covers normal application roles,
not privileged administrators or an assertion of immutable object-store bytes.

## Typed adapters and uncertain outcomes

Use one typed drawing-command boundary for both upload UIs. Remove implicit
tracking/provisioning and direct source changes from viewers, log imports,
titleblock re-extraction, generic editing and bulk paths, or keep those actions
explicitly unavailable until they have a safe command. Metadata-only editing
must not resend stale source fields. Preserve publication/fab-gate semantics.

Generate the request UUID once when a reviewed operation is prepared. Persist
the exact bounded request and recovery identity in an identity/project-scoped
durable client journal before sending; store no credentials, signed URLs or PDF
bytes there. A lost response retains that same payload/key. An authorized receipt
lookup reports committed or not-yet-committed; it does not expose another actor's
request or confer write rights. A lookup racing an in-flight operation returns
pending/retry guidance, not permission to generate a replacement request.

Reauthorize before replay and after sign-in/workspace changes. Changed payload
under a used key is an error. A response lost after commit must recover one
receipt with no duplicated set, sheet, revision, zone or activity. Show committed
success separately from follow-up cache/schedule failures. Retain an unused
uploaded PDF after failed application; no automatic object deletion or upsert.

## Observation export, recovery and erasure

Private source observations are business retention, not replay authority.
Extend the existing project-export path without replacing its shared v2 shape:
use an explicitly versioned drawing-evidence extension containing paginated
observations and non-authorizing operation provenance. Include their PDF paths
in the file manifest. Do not export a usable actor/request idempotency namespace
that can be imported as a committed operation or approval.

The reader must enforce the existing export authorization, current membership
and MFA policy with a single-project bound, pagination and no row-cap loss.
Normal project exports containing observations must not silently omit the
extension; older exports remain distinguishable as lacking it. Add tests for
shared v2 consumers and workspace export aggregation. Project-export changes
require separate reviewed Edge deployment; preserve its gateway JWT mode.

Provide and rehearse a scoped operator recovery procedure in a disposable
database: retain observations as observations, remap relationships explicitly,
and never restore current pointers, request receipts or engineering approval
by importing arbitrary JSON. This is not a new general-purpose restore UI or
a claim that project JSON alone is a complete disaster-recovery backup.
Soft archives retain business observations; account anonymization and authorized
project/org erasure must preserve the repository's existing identity rules and
remove only the intended scope. No new customer deletion or PDF cleanup power.

## Verification and staging sequence

Write negative tests first for partial create/revision failure, direct REST/API
bypass, unsafe inherited grants, revision/code reuse, stale extraction, unknown
pages, and response-loss/reload recovery. Add real independent-session tests for
same/different-key races, parent/source changes, archival, revocation/MFA changes,
erasure contention and each late-write failure. Assert entire related-table
snapshots, not only the return value. Exercise maximum bounds and timeouts.

Before any staging mutation, compare exact relevant installed bodies, Storage
policies, grants/inheritance, Auth/MFA and erasure helpers. Retain the prior
definitions. Rehearse exact SQL under rollback first; do not disable normal
triggers/RLS or copy production customer data/secrets. Then install the reviewed
candidate only in staging with matching ledger payloads where applicable and
record hashes. Do not reset the persistent staging branch.

Use synthetic fixtures: two companies, two projects each, viewer/field/PM/admin,
removed members, archived/locked projects/sets, supported module configurations,
fresh and stale client versions. Test direct REST/RPC independently of menus,
both upload UIs, manual PDF review, exact page readback, revision carry,
round/evidence/fab gates, export/download, uncertain outcome and offline replay.
Run advisors and classify existing versus new findings. Test rollback after
successful synthetic writes without deleting retained evidence or reopening
unsafe writes. Staging acceptance requires real authentication, not only a
privileged SQL fixture or green local tests.

Run the isolated behavioral and real PostgreSQL suites, focused app tests,
full Vitest, lint, all typecheck ratchets, no-new-JS, build and focused rendered
browser checks against the final source. Require the five existing release jobs
for the exact production candidate SHA; do not treat PR #554's previous green
source as proof for new changes.

## Exact production approval package and release ordering

After implementation and staging pass, present the owner:

1. Final source/PR/SHA; every SQL filename/version and SHA-256; exact statements,
   dependency/precondition checks, ledger payload hashes and touched objects.
2. Current and proposed privileges, functions/triggers, affected old callers,
   installation bounds, maintenance/reload handling and release sequence.
3. Every Edge source bundle/file hash and prior backup, gateway JWT mode,
   configuration-name changes without secrets; no unrelated llm-proxy redeploy.
4. Synthetic staging results, failure/race coverage, actual remaining gaps,
   export/recovery/erasure evidence and advisor findings.
5. Rehearsed rollback/forward-recovery scripts and stop conditions that retain
   committed evidence, receipts and security protections.

Apply nothing to production before that exact package is approved. The compatible
frontend must remain unable to attempt new commands before backend readiness.
The reviewed privilege cutover and compatible client/Edge publication need an
explicit maintenance/reload sequence for open tabs; reverting to old frontend
code must not re-enable unsafe source writes. After approved application, verify
installed definitions, grants and exact ledger payloads, rerun drift and verify
the live app non-destructively. Those are future release steps, not completed
results in this document.

## Review boundary

This written design requires user review before the detailed implementation
plan. The plan then requires review and an execution-method choice before code
or hosted staging changes. Production approval remains a separate final gate.
