# App-files Project Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce project file permissions at the Storage boundary without
rewriting historical evidence or losing existing files.

**Architecture:** A private server-owned binding authorizes each exact object
path. Reviewed upload reservations create new bindings; reviewed reference
mapping classifies existing objects. Storage policies read this authority,
while the client passes explicit scope and expires identity-scoped signed links.

**Tech Stack:** PostgreSQL RLS and reviewed Supabase RPCs/Storage, TypeScript,
React, Vitest, PGlite and real PostgreSQL/Storage acceptance.

**Spec:** [App-files boundary audit and proposed contract](../../audits/APP_FILES_PROJECT_BOUNDARY_2026-10-09.md).

## Global Constraints

- Proposed follow-up only; do not fold unreviewed policy changes into the frozen release.
- Never use db push, migration repair or MCP apply_migration. Generate a fresh migration filename with the CLI when implementation begins; root owns reviewed application/stamping.
- No customer paths/contents in audit artifacts. No deletion or orphan inference for the 1,423 unclassified objects.
- No captured-evidence rewrite, source-object rename/deletion, or reinterpretation of PM release authority.
- Preserve existing enrolled-MFA policy and all non-app-files buckets.
- No new framework versions, paid-module restrictions or caller-controlled bypass flags.
- New source is TypeScript. Full source checks run in CI; local checks remain focused to avoid repeating the prior host resource failure.
- Previously issued signed links retain their 3,600-second expiry; do not promise instant revocation.

## Review Focus

- A forged reference to another project's path must not create permission (Task 1).
- Calling a drawing source an attachment must not preserve a weaker write-role floor after adoption (Task 2).
- A removed project member who still belongs to the organization must lose new file access (Task 2).
- A late upload/signing result after workspace A→B→A must not attach to the wrong context (Task 3).
- A legacy object referenced by multiple projects or an unclassified workflow must not be assigned by guesswork (Task 1).
- A file already captured in a submitted revision round must survive ordinary cleanup unchanged (Tasks 2 and 4).

## Task 1: Private binding model and reviewed legacy inventory

**Files:** new timestamped migration for `steelbuild_storage` schema and private
bindings; new `supabase/tests/app-files-project-boundary/{fixture,cases,verify,postgres}.ts`;
new aggregate-only `scripts/app-files-binding-inventory.ts`; its focused tests;
required migration classification only when a concrete source candidate exists.

**Interfaces:** `steelbuild_storage.object_bindings` is keyed by `(bucket_id,
object_path)` with `org_id`, `scope_kind` (`project`, `organization_brand`,
`user_avatar`), nullable `project_id`, nullable `subject_user_id`, creator,
workflow and unique actor/request receipt. Constraints enforce the scope's
required fields and matching project organization. No client table grants.

- [ ] Write failing tests for absent/mismatched scope, foreign project, forged
  application reference, duplicate request collision and unclassified existing object.
- [ ] Run `npm test --prefix supabase/tests/app-files-project-boundary`; confirm
  the authorization expectations fail before implementation.
- [ ] Implement the private model, exact request receipts and aggregate-only
  inventory. Review reference provenance; merely finding a path in a writable
  row cannot authorize its adoption. Do not mutate Storage metadata or paths.
- [ ] Compare every surveyed reference column plus discovered JSON/nonproject
  producers. Output counts of unambiguous, conflicting, missing and unclassified
  bindings. Keep unresolved mappings out of the executable backfill.
- [ ] Run focused cases and `npm run test:postgres --prefix
  supabase/tests/app-files-project-boundary`; prove no direct binding INSERT or
  UPDATE by authenticated or ordinary application service-role callers and no
  mutation of evidence rows. Test actual schema/table/default grants; do not
  claim that RLS constrains a database owner or reviewed operator maintenance.
- [ ] Commit the reviewed model and exact inventory procedure. Policy cutover
  remains blocked while legacy treatment is unresolved.

## Task 2: Server reservations and app-files RLS enforcement

**Files:** follow-up timestamped migration; the same SQL harness; scoped
`commercial-postgres` CI step; no edits to dirty security candidates.

**Interfaces:** `reserve_app_file_upload(p_request_id uuid, p_scope jsonb,
p_workflow text, p_extension text) returns jsonb` returns
`{request_id,bucket:'app-files',path}`. Private
`steelbuild_storage.can_access_object(bucket text,path text,operation text)`
returns boolean. Supported operations are `read`, `insert`, `update`, `delete`;
unsupported operations fail closed. Scope fields match Task 1.

- [ ] Reproduce the existing failure with real PostgreSQL: org member with no
  project grant lists/uploads; project viewer mutates an owned file; project
  revocation leaves org access but must deny file access under the new contract.
- [ ] Implement actor-bound reservations with exact scope/workflow validation,
  project organization matching and post-wait permission/MFA rechecks. Never
  use editable user metadata as authorization. Reservation paths are stable
  across lost-response retries and cannot be reassigned to another actor/scope.
- [ ] Implement private read/write checks. Project reads require current access;
  project writes require PM for drawings/model3d and field for other project
  workflows, plus ownership for update/delete. Branding writes require org
  admin/owner; avatar writes require its authenticated subject and current org
  membership. Neither scope may masquerade as a project file.
- [ ] Validate new entity attachments against the bound project/scope. Atomically
  raise the binding's immutable write-role floor when a generic upload is
  adopted as a drawing/model source. Prove that a field actor cannot retain
  replacement rights by selecting a weaker reservation workflow; do not change
  historical paths or captured evidence to achieve this.
- [ ] Deny ordinary UPDATE/DELETE/rename of a captured source object. Explicit
  reviewed erasure behavior must remain separate and tested, not an application
  service-role or GUC exemption.
- [ ] Replace only the four app-files policies. Preserve restrictive MFA and
  sibling bucket policies byte-for-byte. No broad legacy fallback after cutover.
- [ ] Run actual PostgreSQL session tests for simultaneous reservations, changed
  membership/role/MFA while waiting, source replacement versus capture, archive,
  attempted path reassignment and repeated request collisions. Test no loss of
  captured metadata/bytes during ordinary cleanup.
- [ ] Commit after independent SQL review. Do not apply or stamp hosted SQL yet.

## Task 3: Explicit upload context and identity-scoped signed links

**Files:** `src/api/client/{uploads,storage,supabaseTypes}.ts`; new
`src/api/client/fileAccess.ts`; existing focused upload/storage tests;
`src/hooks/useResolvedFileUrl.js` converted to typed `.ts`; hook tests;
upload callers under drawing upload/revision, GC documents, photos/FieldToday,
field outbox, DMS, scope, RFIs/imports, model3d and shared attachments.

**Interfaces:** `FileAccessScope` is the discriminated union
`{kind:'project';projectId:string}` |
`{kind:'organization_brand';orgId:string}` |
`{kind:'user_avatar';orgId:string;userId:string}`.
`UploadFileArgs.scope` is required. `reserveFileUpload(requestId:string,
scope:FileAccessScope,workflow:UploadWorkflow,extension:string)` returns the
Task 2 receipt. UploadFile still returns `{file_url,file_name,path}`.
Cache identity is `(auth user, session generation, active org generation,
bucket,path)` with an expiry derived from the existing 3,600-second TTL.

- [ ] Add failing tests: missing scope, stale workspace generation, different
  user with same path, A→B→A workspace switch, expired cache and late signed-URL
  response. Assert no upload retry or entity save occurs after context changes.
- [ ] Reserve server-owned paths before upload. Preserve upload validation,
  stable retry path and `upsert:false`; verify a duplicate retry against its
  reservation/object identity instead of treating an unrelated collision as success.
- [ ] Pass the reviewed project from each caller, not a newly read active
  project after an await. Give outbox records persisted project identity and
  assert the matching current user/workspace generation before each attempt.
- [ ] Clear and expire signed-link cache; discard late responses. Preserve the
  public getSignedUrl/resolveFileUrl call shapes for existing consumers while
  moving cache internals into the typed helper. Do not log signed URLs.
- [ ] Run targeted Vitest upload/hook/outbox suites. Run the existing CI lint,
  TypeScript/JS/strict ratchets, no-new-JS, full tests/build/browser gates.
- [ ] Commit by caller group after the shared API tests pass; no mixed legacy
  client may reach a policy cutover that rejects all its new uploads.

## Task 4: Accurate project export and controlled acceptance/cutover

**Files:** `supabase/functions/project-export/index.ts` and focused tests;
SQL/Storage acceptance harness under `supabase/tests/app-files-project-boundary/`;
scoped backend release candidate and installed evidence documentation.

**Interfaces:** `list_project_file_manifest(p_project_id uuid)` returns only
authorized `{bucket,path,size}` bindings for that project. Preserve existing
email-attachment project enumeration; never inventory an entire org for export.

- [ ] Add a red export test with `<org>/uploads/<opaque>.pdf` mapped to the
  requested project and a second project's mapped object. Include exactly the
  first object and preserve pagination without exposing the second path.
- [ ] Replace the app-files prefix walk with authoritative bindings. Retain
  explicit incomplete/unclassified status in an export when inventory cannot
  be proven complete; do not label an empty manifest complete.
- [ ] Rehearse exact candidate SQL on staging under rollback with actual RLS,
  triggers and enrolled MFA. Independently inspect the proposed reference map
  and counts; zero unresolved policy treatment is required before cutover.
- [ ] Separately authorize and run bounded synthetic Storage tests: upload/read,
  revoke/downgrade/archive, owner replacement, cache identity switch, expired
  links, branding/avatar scopes, sibling-bucket preservation and captured-source
  retention. Count every created object; do not delete captured sources as cleanup.
- [ ] Run the five existing required source/deploy gates against the exact
  reviewed SHA. Root manually applies/stamps matching SQL and deploys compatible
  clients only after concrete acceptance and rollback review.
- [ ] Verify installed hashes, live policies and synthetic acceptance; document
  the remaining signed-link validity window. A rollback must preserve binding
  records and new object paths; never recover availability by restoring broad
  unaudited project access.

This is a reviewable plan, not authorization to execute hosted changes. The
release owner must first resolve legacy mapping, nonproject scope semantics and
the coordinated client/policy cutover described above.
