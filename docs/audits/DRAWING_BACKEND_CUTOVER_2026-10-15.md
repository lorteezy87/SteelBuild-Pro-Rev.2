# Drawing backend cutover inventory — 2026-10-15

Task 1 source/capture inventory, not an installed backend or production release. Worktree: `C:/Users/nlort/.codex/worktrees/detailing-production-repair/SteelBuild-Pro`, branch `codex/detailing-production-repair`, PR #554; implementation base `994b1c8f` (product baseline `e2a45cb02829c5275fc602eb235c289de1f2dd0f`). Production and staging were strictly read-only. No migration, DDL, Auth, Storage, customer-row, release, or grant mutation occurred.

## Captured evidence and limits

The committed SELECT-only collector is `supabase/tests/drawing-set-revision-transaction/preflight.sql`. Both captures ran through approved Supabase `execute_sql` with their explicit project refs. Complete JSON lives in the ignored `.superpowers/sdd/2026-10-15-drawing-backend-cutover/` workspace; latest files are `catalog-production-r1-final.json` and `catalog-staging-r1-final.json`, with adjacent `preflight-*-report-r1-final.json` reports. Original captures remain historical evidence. These artifacts contain catalogs, definition SHA-256 hashes, policies, ACLs, defaults and role settings, not customer rows, auth factors, object names, credentials or function bodies.

| Target | Catalog UTC time | Capture file SHA-256 |
| --- | --- | --- |
| Production `kjrwqagyeswwoxpjkcko` | 2026-10-15T20:23:24.328041Z | `ccb0302b92277b6377409101032ea11e37851e4de54de96dd9c76149ebbb102a` |
| Staging `ndyfjffsulfbwpmwdmic` | 2026-10-15T20:23:17.841779Z | `6f8baa96f5e57e120f4608173bc4f4ad8a79cc144b51875f14334fc30b4f76d9` |

The envelope `projectRef` records the target selected by the operator/tool. Offline JSON validation is **not cryptographic proof of project origin**. The database name `postgres` cannot distinguish these targets. Management `get_project` confirmed production; staging SQL succeeds but top-level `get_project` reports not found for this branch ref. Do not relabel production as staging. Production can never return `readyForStaging=true`, even if supplied as the expected ref.

| Catalog section | Production | Staging |
| --- | ---: | ---: |
| Tables / columns | 14 / 362 | 14 / 362 |
| Core columns (drawings / sets / revisions) | 48 / 47 / 26 | 48 / 47 / 26 |
| Functions / policies / triggers | 445 / 57 / 42 | 433 / 52 / 42 |
| Constraints / indexes | 124 / 100 | 124 / 102 |
| Roles / membership edges / default ACLs | 32 / 23 / 33 | 32 / 26 / 25 |

Staging adds `idx_drawing_holds_drawing_active` and `idx_submittal_rounds_submittal`. Production additionally contains Blueline and Stripe-schema functions; `extensions.grant_pg_net_access()` differs. Production's Blueline Storage policies are absent in staging. These are captured drift, not authorization to alter unrelated ownership or schemas.

All three core tables have RLS enabled, not FORCE RLS, and direct authenticated/service-role `INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES` privileges; anon has none. Column-level effective checks consequently also permit protected source writes. No API-root inherited role grant was found beyond the captured memberships, but the validator traverses both inherited and SET-able roles and checks PUBLIC/table/column ACLs independently. RLS does not replace this privilege boundary, and privileged administrators retain their PostgreSQL capabilities.

Review round 1 added captured `createRole`, `createDb` and `replication` attributes and checks ownership independently of ACLs for every API-reachable captured table, schema and routine. Reachability is computed per API principal, including NOINHERIT/SET-able memberships. Superuser, role/database creation, replication and reachable BYPASSRLS attributes block readiness; only the platform `service_role` principal's own existing BYPASSRLS is intentional. An anon/authenticated route to that role still blocks. No API-reachable ownership or dangerous-role findings appeared in the fresh captures; this does not weaken the existing broad-grant blockers.

Installed API deadlines on **both** targets: `anon=3s`, `authenticated=8s`, `authenticator=8s`; authenticator also has `lock_timeout=8s` and `pgrst.db_pre_request=steelbuild_security.check_request_mfa`. The management SQL session's 2-minute timeout is not the API timeout. The validator checks scoped database-role overrides and zero/unbounded function overrides too. Missing/unbounded deadlines block hosted testing; never alter shared roles silently. Future drawing commands still require their separately reviewed function-local 2-second lock timeout and bounded ordered NOWAIT locking.

The timeout and MFA-hook checks now share effective-setting precedence: database-only settings, then role settings, then database-and-role settings. Empty hook overrides are preserved and rejected, not treated as a reason to fall back to the role's approved hook. The fresh captures retain the expected effective MFA hook and deadlines.

## Exact direct-operation matrix for Task 4

Direct writes are a column allowlist, still subject to existing project/org/MFA/lock authorization. Only `authenticated` may receive UPDATE on these columns; PUBLIC/anon/service_role receive no direct core mutation grants. No direct INSERT, UPSERT, DELETE, TRUNCATE, TRIGGER or REFERENCES grants are proposed. A table UPDATE grant would defeat the allowlist and is rejected.

| Relation | Permitted direct UPDATE columns |
| --- | --- |
| `public.drawings` | `notes`, `reviewer`, `due_date`, `spec_section`, `priority_flag`, `fabrication_start_date`, `fabrication_finish_date`, `ready_for_install_date`, `final_delivery_date`, `markup_scale`, `scale_status` |
| `public.drawing_sets` | `description`, `notes`, `due_date`, `eor_reviewer`, `area_sequence`, `material_impacted`, `long_lead_impact`, `titleblock_title_rect`, `titleblock_number_rect`, `titleblock_revision_rect` |
| `public.drawing_revisions` | None |

The three titleblock rectangles are narrowly typed calibration/template geometry, not arbitrary JSON authority. Legacy `drawings.markup`, `metadata`, callouts, hyperlinks, source snapshots and routing JSON stay protected. Replacement must reset/re-review stale calibration rather than present the old PDF's scale as valid for a new PDF. This matrix does not change role thresholds or grant independent annotation-table authority.

Every other observed core column is protected, including source/identity, derived totals, routing, approval, stage/current/lifecycle flags and caller timestamps. Unknown future columns default protected. Exact captured protected lists:

- `public.drawings`: `ai_extraction_error`, `ai_extraction_source`, `ai_extraction_status`, `callouts`, `created_at`, `deleted_at`, `discipline`, `drawing_id`, `drawing_set_id`, `drawing_set_name`, `extracted_text`, `file_url`, `hyperlinks`, `id`, `ifc_status`, `is_deleted`, `is_superseded`, `last_extracted_at`, `linked_rfi_ids`, `markup`, `metadata`, `override_reason`, `pdf_page`, `project_id`, `project_name`, `return_date`, `revision_number`, `set_approval_status`, `set_approved_date`, `sheet_number`, `stage`, `submitted_date`, `thumbnail_url`, `title`, `updated_at`, `upload_batch_id`, `upload_status`.
- `public.drawing_sets`: `category`, `created_at`, `current_submittal_id`, `deleted_at`, `detailing_state`, `discipline`, `failed_count`, `file_url`, `id`, `is_deleted`, `is_locked`, `issued_by`, `issued_date`, `linked_work_package_ids`, `locked_at`, `locked_by`, `locked_reason`, `metadata`, `needs_review_count`, `processed_count`, `project_id`, `project_name`, `register`, `revision`, `revision_history`, `revision_summary`, `set_approval_notes`, `set_approval_status`, `set_approved_by`, `set_approved_date`, `set_name`, `sheet_count`, `stage_summary`, `status`, `submittal_status`, `updated_at`, `upload_batch_id`.
- `public.drawing_revisions`: `archived_at`, `created_at`, `created_by`, `drawing_id`, `file_id`, `file_url`, `id`, `is_current`, `issued_at`, `pdf_page`, `project_id`, `received_at`, `release_status`, `revision_code`, `revision_name`, `revision_notes`, `revision_reason`, `revision_source`, `sheet_number`, `sheet_title`, `supersedes_revision_id`, `updated_at`, `updated_by`, `version_number`, `viewer_height`, `viewer_width`.

Current defaults include `drawings.pdf_page=1`, revision code `'0'`, discipline `'Structural'`, and callouts/hyperlinks `[]`; these are legacy defaults, not reviewed incoming source evidence. New commands must explicitly validate reviewed page/number/title/revision and preserve unknown extraction as NULL. `drawing_revisions.release_status='received'` is the correct new-intake lifecycle value. No page/code/date, approval or historic byte evidence may be invented.

## Command matrix and current behavior

Signatures below are PostgreSQL type identities; whitespace after commas is immaterial. Named SQL arguments remain the frozen contract in the task constraints.

| Operation | Exact existing/proposed signature | Current disposition |
| --- | --- | --- |
| New set | `create_drawing_set_from_review(uuid,jsonb)` | Absent; required new reviewed command |
| Revision | `apply_drawing_set_revision(uuid,jsonb)` | Uninstalled candidate; no runtime fallback |
| Source read | `get_drawing_revision_sources(uuid,text[])` | Uninstalled candidate |
| Receipt read | `get_drawing_command_receipt(uuid,text,jsonb)` | Absent; actor/request UUID shared across operations |
| Capabilities | `get_drawing_command_capabilities(uuid)` | Absent; names alone do not prove readiness |
| Submittal workflow | `apply_submittal_round_workflow(uuid,uuid,timestamptz,text,uuid,uuid[],jsonb,boolean)` | Authenticated-only wrapper; preserve current evidence/approval gates |
| Evidence reconciliation | `reconcile_submittal_round_evidence(uuid,uuid,timestamptz,text,uuid,uuid[],text)` | Existing authenticated wrapper; review transitive `steelbuild_workflow.apply_round` |
| Publish | `publish_drawing_revision(uuid,text)` | Authenticated PM+ with MFA/access; replacement must bind current source and preserve fab gates |
| Place hold | `place_drawing_hold(uuid,text)` | Existing field+ threshold; no atomic revision binding |
| Release hold | `release_drawing_hold(uuid,text)` | Existing field+ threshold; current UI separately restores revision status |
| Set lock | `set_drawing_set_lock(uuid,boolean,text,timestamptz)` | Absent; PM lock, admin reasoned unlock required |
| Set archive | `delete_drawing_set(uuid)` | Authenticated admin; SQL updates children/parent atomically, but lock/count/audit/concurrency behavior remains unverified; hold UI until verified |
| Individual archive/restore, rename/reroute, implicit history | No safe atomic command proven | Explicitly held; no invented sibling compatibility |
| Single/bulk erasure | `hard_delete_record(text,uuid,text)`, `hard_delete_records(text,uuid[],text)` | Authenticated/service EXECUTE; dynamic allowlist/project-admin logic; preserve and review dependency cleanup |
| Project/org erasure | `hard_delete_project(uuid,text)`, `hard_delete_organization(uuid,text)` | Authenticated/service EXECUTE; preserve owner/admin/reason/archive requirements and private-data cleanup |
| Org reset | `reset_org_data(uuid,text)` | Authenticated/service EXECUTE; owner/name-confirmation path calls project erasure |
| Account erasure | `erase_my_account(text)` | service_role-only; never expose to authenticated |
| Sole-member workspaces | `erase_my_sole_member_workspaces(text)` | Authenticated/service EXECUTE; preserve account-delete integration |
| Titleblock map | `save_titleblock_map(uuid,text,jsonb,jsonb,jsonb)` | SECURITY INVOKER authenticated/service; writes calibration only, still needs sibling review |
| Count maintenance | `recount_drawing_set(uuid)` | service_role callable; updates counts **and tombstones an empty set**, no actor/project check; internalization/compatibility review required |
| Stuck extraction maintenance | `reconcile_stuck_extractions()` | API EXECUTE revoked for all three roles; cron/postgres maintenance remains separate |

The existing publish statuses are `reviewed`, `released_for_estimate`, `released_for_shop`, `released_for_field`. Its present definition can repoint the current row; it does not establish the future source-matching/gating behavior. Hold RPCs write hold/activity records while the UI writes revision lifecycle separately. The existing lock UI directly sets caller-controlled actor/time fields. These are repair requirements, not permission to weaken workflow or source protections.

Current captured-evidence protection is real but narrower than the planned boundary: `captured_revision_source` calls `steelbuild_workflow.guard_captured_revision()`; `evidence_immutable` calls `guard_round_evidence()`; submittal workflow guards are active. The private `steelbuild_drawing_revision.requests` and `source_observations` tables do not exist on either target. All new command/package capability booleans must remain false until the entire exact compatible package is installed and reviewed.

Erasure lineage: `20260912055243_hard_delete_project_dependency_ordered_deletes.sql`, `20260912062606_hard_delete_organization_cursor_and_note_folders.sql`, `20260912052502_reset_org_data_suppress_triggers_in_org_tail.sql`, `20260927160000_account_deletion_releases_authorship.sql`, `20261007090057_acquire_erasure_relation_locks_before_rows.sql`, and the current catalog definitions. `20261013085637_secure_function_defaults_and_internal_helpers.sql` closed direct EXECUTE for `erasure_toggle_user_triggers(text[],boolean,text[])`, `hard_delete_toggle_triggers(text[],boolean,boolean,text[])`, and `hard_delete_release_dependents(text,uuid[],integer)`; both fresh catalogs confirm those revokes. Their dynamic cleanup and source/receipt erasure still require review. No broad revoke is authorized by an unclassified entry.

Old-client behavior after the coordinated boundary: source/history/set creation, direct approval/stage/current changes, direct lock, rename/reroute and unsupported individual archive/restore fail before persistence. A mixed metadata+protected PATCH is denied as a whole; never silently fall back to multiple writes. Safe metadata/calibration can save under existing RLS. Supported workflows move to their exact commands. This denial will break current sibling clients until coordinated; that is a cutover blocker.

## Runtime caller inventory

All paths are relative to this Rev.2 worktree. These are source-grounded findings, not claims that future Task 10 fixes already exist.

| Source | Observed operation / required disposition |
| --- | --- |
| `src/api/client/entities.ts:118` | Generic Drawing/Set/Revision CRUD plus deleteCascade; close protected wrappers while retaining safe reads/metadata |
| `src/api/client/softDelete.ts:18` | Core soft-delete list; permanent erasure helpers resolve through generic client; review lifecycle paths |
| `src/components/drawings/upload/useDrawingSetCreation.js:135` | Set create, sheet bulk/single create and replacement update; migrate to reviewed New Set command |
| `src/components/drawings/RevisionUploadModal.jsx` | Current in-place apply containment; preserve fail-closed behavior until atomic revision command |
| `src/lib/drawingHub/revisions.js:24` | ensureCurrentRevision inserts placeholder/current history; new revision archives/backfills/inserts then carries zones/links; remove split writers |
| `src/lib/drawingHub/proposals.js:505` | Proposal acceptance implicitly provisions history; keep browsing, require reviewed tracking |
| `src/pages/drawingViewer/useZoneData.js:105` | Viewer opening calls history provisioner; must become read-only current lookup |
| `src/components/drawings/RevisionCompareModal.jsx:279` | Compare can provision history; require tracking state without creating history |
| `src/pages/DrawingViewer.jsx:313` | Manual revision bump calls split carry-forward; hold/review upload path; calibration at line213 stays permitted |
| `src/components/drawings/register/registerProvision.ts:81` | Direct initial current revision insert from parent source with invented title fallback; retire provisioner |
| `src/lib/drawingHub/setLock.js:32` | Direct lock/unlock PATCH, actor/time from caller; move to lock RPC |
| `src/components/drawings/register/HoldsPanel.tsx:173` | Separate revision on_hold write; release line208 restores saved status on then-current row; move to revision-bound RPC |
| `src/hooks/usePublishRevision.ts:34` | Existing publish RPC; retain signature and replace backend semantics |
| `src/components/drawings/DrawingLogImportModal.jsx:124` | Set create, sheet create, metadata/source/identity patches; only allowed metadata remains, report rejected rows |
| `src/components/drawings/TitleblockMarkerModal.jsx:376` | Rectangles allowed; line409 auto-applies extracted title/number/revision to existing sheets, must hold source application |
| `src/components/drawings/BulkEditModal.jsx` | Produces bulk sheet patches; strip/hold approval/revision/stage/protected fields |
| `src/components/drawings/RenameSetModal.jsx` | Produces parent-name/routing rename; no proven atomic command, hold |
| `src/hooks/useDrawings.ts:118` | Generic create/update/delete/bulk stage; lines287/324/356 approve/reject/supersede with caller dates and revision patches; retire protected actions |
| `src/pages/drawings/drawingMutationHelpers.ts:9` | UI containment strips unchanged subset of source fields, not a DB boundary; replace with exact allowlist |
| `src/pages/drawings/useDrawingsPageController.ts:118` | Create/delete/undo/set cascade/bulk stage/bulk edit/approval/rename writes; preserve safe metadata and only verified command actions |
| `src/pages/DrawingSubmittalHub.tsx:734` | Reviewer metadata allowed; line784 directly writes `detailing_state` (protected stage), hold unless governing workflow; line797 readiness flags permitted |
| `src/components/drawings/viewer/useMarkup.js:93` | Annotation query filters drawing_id but not revision; line150 stores per-item revision IDs. Preserve legitimate annotation editing and prevent prior-revision overlays; protected legacy markup blob is separate |
| `src/pages/drawingViewer/useAutoScaleOnLoad.js:32` | Writes markup_scale including undo; preserve authorized calibration and invalidate/re-review on source replacement |
| `supabase/functions/project-export/exportShape.ts:36` | Export reads core histories but not new private observations/receipts; coordinated export format/private read decision required |
| `supabase/functions/account-delete/index.ts` | Account erasure entry point; review new private-data cleanup before cutover |

Shared barrel `src/lib/drawingHub.js:45` re-exports the legacy history mutators; removing an interactive button alone does not retire reachable source APIs. The direct source scanner also found `register/sheetSetEvidence.ts`, `crossSetSupersedeRepository.ts` and validation repositories as reads, not mutation authority. GC drawings use their own tables and must not be silently included in this core grant change.

## Actual sibling callers: incompatible, owner coordination required

Inspected GitHub source at pinned commit `6a206511511b7eb9d2531c2487f683b5d6a8731c` in [SteelBuild-Pro-2026](https://github.com/lorteezy87/SteelBuild-Pro-2026/tree/6a206511511b7eb9d2531c2487f683b5d6a8731c). This is source evidence, not that sibling's current deployment SHA or an owner-approved migration. No sibling code was modified.

| Pinned sibling path | Concrete incompatible caller |
| --- | --- |
| [src/api/client/drawings.ts](https://github.com/lorteezy87/SteelBuild-Pro-2026/blob/6a206511511b7eb9d2531c2487f683b5d6a8731c/src/api/client/drawings.ts) | Direct set INSERT/update/name/lock; sheet INSERT, identity/stage PATCH, attachFile, markup blob and bulk tombstones; revision INSERT/archive. delete_drawing_set RPC already used |
| [src/api/client/drawingUploads.ts](https://github.com/lorteezy87/SteelBuild-Pro-2026/blob/6a206511511b7eb9d2531c2487f683b5d6a8731c/src/api/client/drawingUploads.ts) | Separate set create, PDF upload, file_url update, sheets insert, initial current histories insert |
| [src/api/client/drawingFiles.ts:66](https://github.com/lorteezy87/SteelBuild-Pro-2026/blob/6a206511511b7eb9d2531c2487f683b5d6a8731c/src/api/client/drawingFiles.ts#L66) | Legacy snapshot insert, archive outgoing row, insert new current revision, then repoint sheet at line74 |
| [src/api/client/drawingSetRevisions.ts:109](https://github.com/lorteezy87/SteelBuild-Pro-2026/blob/6a206511511b7eb9d2531c2487f683b5d6a8731c/src/api/client/drawingSetRevisions.ts#L109) | Loops split replaceSheetFile; unmatched pages insert sheets/current history |
| [src/api/client/titleBlock.ts](https://github.com/lorteezy87/SteelBuild-Pro-2026/blob/6a206511511b7eb9d2531c2487f683b5d6a8731c/src/api/client/titleBlock.ts) | applyRescanPatches writes extracted source plus caller timestamp; saveProjectTitleBlockMap calls existing invoker RPC |
| [src/hooks/useDrawings.ts](https://github.com/lorteezy87/SteelBuild-Pro-2026/blob/6a206511511b7eb9d2531c2487f683b5d6a8731c/src/hooks/useDrawings.ts) | Runtime mutation hooks expose bulk update/remove, set lock and old markup PATCH |
| Sibling `src/components/drawings/{AttachSheetFileDialog,UploadSetRevisionDialog}.tsx` | Search found runtime imports of replacement/set-revision split writers |

There is no demonstrated compatible sibling adapter, held-feature release, coordinated owner decision, or deployed caller cutoff. **Unresolved sibling callers block hosted cutover.** Shared schema ownership remains unresolved. No metadata grant may be expanded to keep these protected writes working.

## Storage, Auth and privileged-path review

Both targets' app-files Storage policies permit org-scoped upload/read and object-owner UPDATE/DELETE, with a restrictive enrolled-MFA policy. Original PDF uploads currently use non-upsert paths; that client choice is not a Storage immutability guarantee. Existing owners and privileged administrators may still replace/remove bytes. Actual PDF/page readback and the reviewed source-metadata protection package remain required in staging. Never automatically delete failed-command PDFs.

`steelbuild_security.satisfies_mfa()` checks current auth.uid/JWT AAL and verified enrolled factors, and the PostgREST pre-request hook is installed. Captured core drawing policies have no separate restrictive MFA policy; Storage and annotation policies do. Account/session erasure semantics and service-role routes require their existing server checks; this task neither reads auth customer rows nor proves token revocation.

The validator does not infer safe behavior from a name, hash, stability label or sibling SQL lineage. It conservatively inventories every callable volatile SECURITY DEFINER plus recognizable/dynamic/transitive potential writer and requires exact-hash review. Lexical call extraction over-approximates PL/pgSQL; it can classify read helpers as candidates. Extension/external dispatch needs source review because pg_depend does not prove PL/pgSQL dependencies. A missing review produces a stop finding, not a grant-revocation plan.

Every captured trigger function, the MFA hook, and their captured helper dependency closure must exist and receive exact-definition-hash approval even when the function returns `trigger` or is not API-callable. Explicit `review.guardBindings` entries bind each core table to its reviewed trigger identity and guard function identity; declarations must match and be enabled. An arbitrary audit trigger is insufficient. The collector now also inventories Auth/Storage function hashes so `storage.protect_delete()` and `storage.update_updated_at_column()` and their helpers are captured rather than silently excluded. Both fresh catalogs contain the full captured guard closure: zero missing-body findings, with 52 guard/helper exact-hash reviews still unresolved because no cutover approval manifest has been supplied.

At capture there are **105 production / 102 staging potential privileged paths unclassified by a cutover review**. These are not 105/102 confirmed vulnerabilities. The production-only Blueline private rows below have ACL EXECUTE but no effective API schema USAGE and are explicitly distinguished. Fully reviewed out-of-scope helpers may receive an exact-hash reviewed exclusion; never broad-revoke unrelated billing, piece, workspace or sibling RPCs. The three erasure trigger/dependent helpers above are not callable and are absent from this potential-callable list.

| Potential privileged path (all currently unclassified for cutover) | Effective API exposure | Definition SHA-256 |
| --- | --- | --- |
| `blueline_private.delete_tree(text, bigint)` | authenticated | `257963f2cfd3de79ba050dda06a61d1ba8bd3b7547690acdcc7c3f89dd64e427` |
| `blueline_private.put_doc(text, jsonb, boolean, bigint)` | authenticated | `411aa15b5a685fec97059c4f4b651dd56f77eee6ef52cef3cb8f916549ebc1e6` |
| `blueline_private.recover_tree(text)` | authenticated | `2d92b9f4bba453444851fbce79aae1111938d70c247c8e6589bcb22eb5556c6a` |
| `public.accept_invitation(uuid)` | authenticated | `e499ee4d90cc962e862ce49763c69e092d5e7bb73e09a5e7dc220d2745b35596` |
| `public.advance_piece_station(uuid, uuid, text, boolean, text)` | authenticated, service_role | `72fbb07c0bd933e4f700d4b9ab77c55051398fd373975c36d31f010c48e969c2` |
| `public.advance_piece_station_impl(uuid, uuid, text, boolean, text)` | service_role | `d972fbf0eb7f185eddda69c8f0ac770c112311458f9e446c93afd00091bbc622` |
| `public.advance_piece_stations(uuid, uuid[], text, boolean, text)` | authenticated, service_role | `ad623e67b6dcdfb7776aee8a4d28f118d0e5cc0ec240fec5e968e056a08fa58a` |
| `public.advance_piece_stations_impl(uuid, uuid[], text, boolean, text)` | service_role | `20676ed25ec83011ab20185fa1f1d1d556793105bdfe0ccffc48b5e907fad97d` |
| `public.apply_piece_import_batch(uuid)` | authenticated, service_role | `6cdd107f7dbe12d4bb89730fec23bd116672eb46610a3ddc1e96e4dac31a1357` |
| `public.apply_planner_offline_operation(uuid, uuid, text, jsonb, timestamp with time zone, uuid)` | authenticated | `1043767f0791802b46dab15b6d0ada7251e0ef5ea4a40ccbdfb0b08d90fca7d6` |
| `public.apply_project_template(uuid, text)` | authenticated, service_role | `3627a3ab26ce43ec379da809460d5bb7ed4b0fd71010e098ac141a5c2f4d6e42` |
| `public.apply_stripe_billing_event(text, text, uuid, bigint, text, text, text, text, bigint, bigint, jsonb)` | service_role | `c8aa52eb8eacb56bd4751bf95319f8b756e13159ff823d0b1f6e0fba4b783788` |
| `public.apply_submittal_round_workflow(uuid, uuid, timestamp with time zone, text, uuid, uuid[], jsonb, boolean)` | authenticated | `6d58c1cca976662cca126cc1fc9f25ffb66e4c4a0da4b7a973d61920e78a57e2` |
| `public.approve_piece_import_batch(uuid)` | authenticated, service_role | `d9068ee196faf3cbbb5d90401f2771ff92e4726db2cfe05d9941dfd9a03e5338` |
| `public.archive_note_folder(uuid, integer, text, text)` | authenticated, service_role | `69df649b8e448bf046eba06f3e6286a057aca9d1b8e58478460066fef75364ba` |
| `public.archive_piece_lots(uuid, uuid[], text, text)` | authenticated, service_role | `ba32976d0c0af4b3317354546fdc6ef76f6440b1f4a30d7d2712a0db0b804a89` |
| `public.assign_pieces_to_work_package(uuid, uuid[], uuid)` | authenticated, service_role | `65b981916e3451dea5f4fa2ce7dd416c76320050834b12ba1afc9c1a468f9f2f` |
| `public.begin_billing_checkout(uuid, uuid, text, text, boolean, text)` | service_role | `0c733ce09bd9ef09e004815b17c70329e131e8974f72185743104fa651acc562` |
| `public.bind_billing_checkout_customer(uuid, uuid, uuid, text)` | service_role | `9444079838cc17c7023b0bdc265c1abea30e2f0eba4de2cf1995e60ebb5f130b` |
| `public.build_pay_application_lines(pay_applications)` | authenticated, service_role | `c150cc1ac684dd8d3ddce1792d12721b43a0bfeb38a0a8e01abefd52fa7945b9` |
| `public.bulk_update_piece_attributes(uuid, uuid[], jsonb)` | authenticated, service_role | `45a9dfeba233aa1854604a32f306bebee3bf5125fd871017bd73b84b33cde319` |
| `public.complete_staging_e2e_bootstrap(uuid, uuid, uuid)` | service_role | `9d60a87344d2392a97ab064b60bd56a06a08cbe8287c14d4b2cdf46505337af0` |
| `public.consume_desktop_session_handoff(text, text)` | service_role | `17fa3d5474d19c544fef32d522c4042a7357932d831357515efb44c2a448ccac` |
| `public.create_desktop_session_handoff(text, uuid, text, text, jsonb, timestamp with time zone, timestamp with time zone)` | service_role | `5f778b9ea11c43c5ece268bcd7df38d4ce04a57053c726941dfe6dc666a73ce0` |
| `public.create_material_requirement(uuid, text, text, text, text, numeric, text, text, text)` | authenticated, service_role | `4346b32163cc776a47c454d6f5db43c1ab109f3b253622648bce55b6c1df6e7f` |
| `public.create_note_folder(uuid, text, uuid, text)` | authenticated, service_role | `4b24f5011b7ca1320e6bd4169469f32e85bc4fbbc1bb0bdb4079d4f26bb748d9` |
| `public.create_numbered_record(uuid, text, uuid, jsonb)` | authenticated | `4e2f0e9c62890498c3ebecdc0ad226b569c01c9efc572299cee6d2478ceb13a4` |
| `public.create_organization(text, text)` | authenticated | `761e1ec31babc24c11a4460cada5fb619b1df739a0153b62f425503483e17673` |
| `public.create_project(jsonb)` | authenticated | `025976324c1853b87e41ef2b5d42e39b14d0999272e4fd070ca0ba2411b4edc2` |
| `public.delete_drawing_set(uuid)` | authenticated | `0038e8775da3451f2a20d8e0266ee8041627a803566311369f38171e222735b8` |
| `public.deliver_piece_lots(uuid, uuid[], jsonb)` | authenticated, service_role | `b85e31a6f50347a0eefe117c80568e5cc752431a818f7fdba4fe7a755b8e94e2` |
| `public.deliver_piece_lots_impl(uuid, uuid[], jsonb)` | service_role | `a4e58de4879d9c7be7b3d18b33c0ae87386e49b7e456704d64e3244c2d458cb7` |
| `public.ensure_general_notes_folder(uuid)` | service_role | `148f0814279f51db3a4ae15c7754a7d250da9bdc66db7e5af4b48b5ab847ce4a` |
| `public.erase_my_account(text)` | service_role | `38a0ba595af45e65bd3800d17db9e87223bb4edfd29d03f1ad739a170a07edf8` |
| `public.erase_my_sole_member_workspaces(text)` | authenticated, service_role | `460c1446c45aa2240e6a9946edb3117928a531d98170f232d44de6938fbe3e31` |
| `public.erect_piece_lots(uuid, uuid[], jsonb)` | authenticated, service_role | `65347e629f55192fd5a5e3b9e9aa29dab3b752448ab9434c6994514f7d5e18be` |
| `public.erect_piece_lots_impl(uuid, uuid[], jsonb)` | service_role | `2eaf8b57b3e8f04a7f2141daa3b799d330930ec3ead9a0a1c8ec60c8e6976d64` |
| `public.evaluate_fab_release_package(uuid[])` | authenticated, service_role | `1ceb57b9415a318c7bb20867b594df68c94e37398ed8a6a9094b3880760b8aa2` |
| `public.evaluate_fab_release_package_base(uuid[])` | service_role | `5d6b356305803dbc98fcbf2a31e2e10e1a7de113efaf6719b44f619f8f75d5af` |
| `public.evaluate_release_gate(uuid)` | authenticated, service_role | `99eef368f5ff9d13e7626a60768c9080ab4b347ab1a8dfbaee72bd7cfa92b819` |
| `public.expire_billing_checkout_intent(uuid, uuid, uuid, text, timestamp with time zone)` | service_role | `9fc0591449214c72b9acee180490ab7ceeaa6a8c85e257d6b5c87937fab80e26` |
| `public.generate_operational_alerts(uuid)` | service_role | `aeebf6ee35873925af15098e7b1b17a46cae615e9503197466a30731725ce4eb` |
| `public.generate_project_alerts(uuid)` | authenticated, service_role | `f81cf472e9c3d97a76c160da7639600fce0da2964017ce0806506a1a66f922fb` |
| `public.get_next_sequence_number(uuid, text)` | authenticated | `83148dd44e13ed00a6886ac3b76f562d6ac4b419f49b159b5ad15d3ee218e32b` |
| `public.get_submittal_revision_coverage(uuid)` | authenticated, service_role | `5c852775ec03996cc08ce25fcee200752e744d458c265c22869575479dd362ad` |
| `public.hard_delete_organization(uuid, text)` | authenticated, service_role | `404a23ce644aa5cf979bd611538acba3d1abece441b88d2c1eec19d1a88e4d18` |
| `public.hard_delete_project(uuid, text)` | authenticated, service_role | `3ab7c253c5a851e2a7605d85b3cecbb1d3a635a8f513c9a67e26f509b748a634` |
| `public.hard_delete_record(text, uuid, text)` | authenticated, service_role | `d8759d56c0daa99f7414519a5e4c136279334ba270f6f0508c4b68c3437a9a15` |
| `public.hard_delete_records(text, uuid[], text)` | authenticated, service_role | `d7f3ff702a72b4bbaf68b612fcfb67fa8a2d03590e20799113a5a5001fd822f6` |
| `public.link_model_elements_to_pieces(uuid)` | authenticated, service_role | `0c11a15b3587bdfcda80e7ca50edb2aa3c0b3b193d84ada1fd77a7f7d1722ca2` |
| `public.link_model_elements_to_pieces_page(uuid, integer, uuid)` | authenticated, service_role | `81008e47324bfe709f53c8354e38570a31ff6263af021b6faeafe42014881b50` |
| `public.link_piece_drawing(uuid, uuid, uuid)` | authenticated, service_role | `6a57178e99f8366ae1beafdbd08bdd8c0a81bc001b65ac801098d28a6a8f8e4c` |
| `public.link_piece_drawing_set(uuid, uuid, uuid)` | authenticated, service_role | `786ebbb9f6d7f2a428a20313b1ff7c18a276c8ef028d630ee0c7047504d19510` |
| `public.link_unlinked_model_elements_for_piece(uuid)` | service_role | `67d3885067869a7c48932b9152b5a48fc0e78cf1d42e8f235834738c6d444a09` |
| `public.list_visible_note_folders(uuid, boolean)` | authenticated, service_role | `7bbe7a6e206fdc67a043a8adbb79c044b592a9d5fd25a07e7b43259fb83029a5` |
| `public.log_backcharge_event(uuid, text, text, text, text)` | authenticated, service_role | `5ebc6e52711458c0a8f890d7dd55bfffc19dedbb15c6dfba8bc698bdf7f43062` |
| `public.log_submittal_event(uuid, uuid, text, text, text, jsonb)` | authenticated, service_role | `79b7725c759f9bf7bc350752e5ed853c2176415b6f4ddd99b60fd9c30b09571e` |
| `public.log_transmittal_event(uuid, uuid, text, text, text, text, jsonb)` | authenticated, service_role | `59484bc591ed8a51b78d8c77ca3ea05adabfc3983212ec1fb641ed9c7c546d37` |
| `public.map_material_requirement_to_pieces(uuid, uuid, uuid[])` | authenticated, service_role | `63a598866c19d2aaa7b429ea8890c51e843e171b6f312b89ce2e822e6754e7fc` |
| `public.move_note_folder(uuid, uuid, integer, text)` | authenticated, service_role | `3dbca845b11041fd3e386404a9f04a6ff343066821fbe7f53668345b86eea851` |
| `public.note_folder_receipt_put(text, uuid, text, jsonb)` | service_role | `45cc62f2cca36cb02b9967f02ce8ea229d74ff18429f0832547e0db23aea0598` |
| `public.note_folder_reject(uuid, uuid, text, text, text, jsonb)` | service_role | `ddb28374f9a8ec3d28c5cfc36eaa027f411a86745a1b7dcd3fc91a4f841bac07` |
| `public.note_folder_write_audit(uuid, uuid, text, boolean, text, jsonb, jsonb, jsonb)` | service_role | `a4fd5ae827cf4bd8cdd247d07db97021e2c0a8df54b73fdbd8a0c75ab0f6bb22` |
| `public.piece_control_drawing_is_approved(uuid)` | authenticated, service_role | `d7e2424189b25972e19a6b656c5938cc1a97a85fc3bf66f65c1e10718c4dff84` |
| `public.piece_control_pilot_readiness(uuid)` | authenticated, service_role | `cbf63944ed5431a12eba1b82ea5a82f1aea17c9013ae02dedf8e79f42d97fd5d` |
| `public.place_drawing_hold(uuid, text)` | authenticated, service_role | `fb36b1e0ddfbe471f26c042871db461fc5da07bff2f5817705c17e7b5fbe5ec4` |
| `public.project_row_counts(uuid)` | authenticated, service_role | `1c8294fbe68288bc93133b61b8233e07239cff95916ba666736b7e517ac4fd83` |
| `public.prune_client_events(integer)` | authenticated, service_role | `49cd0d0fc9c547524af426d9aed51a3f0918a2bc3f987e50ea883865d1d7a060` |
| `public.publish_drawing_revision(uuid, text)` | authenticated | `05a00a75878d85bfec82cf968e6cf3f9f9574a9affd8ae47841ed409a62e6dba` |
| `public.reconcile_submittal_round_evidence(uuid, uuid, timestamp with time zone, text, uuid, uuid[], text)` | authenticated | `f1e1d209363d0d61049c812cd96c5946114f5126f258e8072d5f75cf86a80730` |
| `public.record_billing_checkout_session(uuid, uuid, uuid, text, text, text, timestamp with time zone)` | service_role | `4bdcd90be084d0a6454d6ae2ea55b361428fa9d0e5c2cfcafb981b9d46354de7` |
| `public.record_piece_control_command_failure(uuid, text, uuid[], text, text, text, jsonb)` | service_role | `710c0bf062c778270aa8acae5c2a159cd2499dae78aa86cc0cc0b5fb932c496a` |
| `public.recount_drawing_set(uuid)` | service_role | `20f65a05125a6d6d9cdcd41792b44e9f3bb6c9a4c16433bbe025dd4996fd4260` |
| `public.refresh_cost_code_actual(uuid)` | authenticated, service_role | `0502828d563ac877ca3ad7c92031fd76d5920f2e3d08920d4d2faab3e159c4e0` |
| `public.refresh_pay_application_totals(uuid)` | authenticated, service_role | `4a46fcb47ed1de7d957943c4dad839efeb4c6da21d6d74b580bbb626531b7670` |
| `public.refresh_project_change_total(uuid)` | authenticated, service_role | `8defc1a99f0ed0dc20b0c96cfadc53af5a5b9c2be725684a1da5a1be4a3799d4` |
| `public.refresh_work_package_progress(uuid)` | service_role | `32555b2394cc88e615d233db52c78e5bffc11fc1142abb21f7876833067ff3c2` |
| `public.release_drawing_hold(uuid, text)` | authenticated, service_role | `d25196cffeaa1d39a160cb6fc975bf2008103f0a1b689620d5f1d8946bf7de30` |
| `public.release_work_package_canonical(uuid, text)` | authenticated, service_role | `9ef61b6f4d5770f75f0bd64aff39525191f4823c75e3b4cccd4af95eba95e763` |
| `public.release_work_package_canonical_impl(uuid, text)` | service_role | `fe78de8876afd3395e510efb120daad861de5bc6dbd6eafa108dc54fd99b3573` |
| `public.rename_note_folder(uuid, text, integer, text)` | authenticated, service_role | `c9adf3c46d8ec203b5f71e9fbef2f8a11fb65548b3b63ec1afc9e7a9cc2456f3` |
| `public.replace_gc_issuance_shop_set_links(uuid, uuid, uuid[])` | authenticated, service_role | `c8f2fad21b79d728ac790e08c79af6129cadf9071c0b93b88c02c0f43daa537e` |
| `public.replace_piece_drawing_set(uuid, uuid, uuid)` | authenticated, service_role | `568362aa892084fb4440f53b5852f8c3ee04496cca01c80f172da2c2a102e9c6` |
| `public.reset_org_data(uuid, text)` | authenticated, service_role | `2cfa21dd7c3f2c37e413a16e4d762dc2773c50032f88117de845671098935006` |
| `public.restore_note_folder(uuid, integer, text)` | authenticated, service_role | `6d5dcce54f7ff93b0a5ddd2a226e1beaa7b8bba93c289e7d884c5d53ae3527dc` |
| `public.seed_project_handoff_items(uuid)` | service_role | `9c85aca2a0b79d93e2f72d23e01ae35fbb40ad1e991e76cc50f95883993f72c9` |
| `public.set_material_requirement_receipt_state(uuid, uuid, text, numeric, text, text, jsonb)` | authenticated, service_role | `0f183d1f97dd60e7398d8a1b266b7fd3a90faf5dcae882df21034beb78b70904` |
| `public.set_note_folder_links(uuid, uuid[], integer, boolean, text)` | authenticated, service_role | `26a713b62e835a4e79ec8e5a81474deaee7dd6fe124271dff53f00db3bea56aa` |
| `public.set_piece_control_mode(uuid, text, text)` | authenticated, service_role | `2a15d41c8b7381ce026459e4c15e99c33bebbca3def9435750d70409d29a399e` |
| `public.set_piece_hold(uuid, uuid[], boolean, text)` | authenticated, service_role | `6748d0da4a144325b269645d43f2cf48a83c86d4a41e506e6955d6f55e3618c7` |
| `public.set_project_station_configuration(uuid, jsonb)` | authenticated, service_role | `98217688f2b79eabb24fb158586cb9d1bb72bd97ef70e4f58f7267b42948f9c0` |
| `public.set_runtime_config(text, jsonb, boolean, text)` | authenticated, service_role | `7d26fdcc6a3aae9de96bf620c8d5a5d6eaf87a08f31a91f33d379a40aac0a8d9` |
| `public.ship_piece_lots(uuid, uuid[], jsonb)` | authenticated, service_role | `b4af65b8b50191461382521ce9b20470e08b9e224c9cf7e87d094ba2401e2180` |
| `public.ship_piece_lots_impl(uuid, uuid[], jsonb)` | service_role | `7f624e67286f5cfa8d9a4fe8a97ca03b07d5602e2b976ad067d99e66c4df1c9c` |
| `public.soft_delete_project(uuid)` | authenticated | `5de294eee2834ac7c1a1ede50301e4e560cd0316d0470981aa47d19c17672930` |
| `public.split_piece_lot(uuid, uuid, jsonb)` | authenticated, service_role | `93f9da0272d2fd4978fc9cc1be4eb36c38598f5cd7bbd2c86d291015b84f37ed` |
| `public.split_piece_lot_impl(uuid, uuid, jsonb)` | service_role | `01ef3b7e23b87068d802c0692a3470708079751e82707e2400ab66d0eb94bf5e` |
| `public.stage_piece_import_batch(uuid, text, text, jsonb)` | authenticated, service_role | `6b524348217629bb25d1c8af261e66872b20517e46c2ae918973d01d6a9b381e` |
| `public.sync_production_stages_to_pieces(uuid, jsonb, text)` | authenticated, service_role | `0b8eaf2e940ebbf0b4367e6f4025d6dcadb56488b6b436c156d53292afab23d4` |
| `public.sync_production_stages_to_pieces_impl(uuid, jsonb, text)` | service_role | `a98b42f18ebf864dd181216daad3f78e35802d8d4896da1de4b89fccb34b90db` |
| `public.transition_piece_lots_canonical(uuid, uuid[], text, text, text, jsonb)` | service_role | `d2e348a14c154ad37ea77aea4a598b26a0b5d818b5a77362d267d7bb138d64e0` |
| `public.unassign_pieces_from_work_package(uuid, uuid[])` | authenticated, service_role | `ed30b190761548f7a436c410172cdd53ac08a377383674577131c02bae742092` |
| `public.unlink_piece_drawing(uuid, uuid, uuid)` | authenticated, service_role | `a83dbcd5913e8963ddcdfefb0ebd13679e5b4253becc1a1ea91ab2724595afbe` |
| `public.unlink_piece_drawing_set(uuid, uuid, uuid)` | authenticated, service_role | `370c30e30bc31339fb881ed967198c5c3185d38c6a4dea0ffea33e31dafaa49d` |
| `public.work_package_drawing_set_reports(uuid)` | authenticated, service_role | `2e5a570464e416f4518de563a71597d666117f218fd7cb3d64333def7dc8be6a` |

## Validator use and stopping conditions

Run `node --experimental-strip-types scripts/drawing-cutover-preflight.ts <saved-catalog.json> <expected-ref>`. It accepts exactly two positional arguments, has no apply flag, and imports no DB client. Exit 0 means reviewed staging preconditions only; exit 1 means readiness blocked; exit 2 means CLI/read/JSON error. Both real captures return exit1 and `readyForStaging=false`, as expected before Tasks 2–4 and caller coordination. This does not block implementing their source candidates.

The exact saved-catalog schema is defined in the validator. Missing/malformed/empty required sections, count mismatches, missing core columns/role privilege samples, broad/inherited grants, API-reachable ownership/admin attributes, overridden MFA hooks, unbounded deadlines, unclassified definers, missing commands/private source tables, missing/unreviewed guard/helper bodies, unreviewed schema hashes and unresolved callers fail closed. Required reviews include pinned source commit, exact catalog serialization fingerprint, definition hashes with reviewed decisions and evidence, explicit per-table `guardBindings`, caller dispositions, coordinated pinned sibling callers, and explicit boundary/source/Storage/Auth/export-erasure evidence. A current function-name list or a bare capability flag is insufficient. A synthetic fully reviewed fixture proves the validator can return true; it is never treated as hosted evidence. Historical captures without the newly required role attributes must be refreshed and are rejected as incomplete rather than having their missing authority flags assumed false.

Remaining gates: implement/review atomic commands and source guards; prove exact disposable-PostgreSQL behavior and privilege denial; retire every reachable split writer; coordinate sibling callers/ownership; install only the complete staging package through reviewed backend release; perform authenticated source/PDF/page/receipt/export/erasure acceptance; prepare an exact production proposal. Production application/publication requires new exact-change approval and is outside this task.

Primary deadline reference: [Supabase Postgres timeouts](https://supabase.com/docs/guides/database/postgres/timeouts). The Supabase changelog and current timeout/MFA documentation were consulted; installed catalog settings above, not documented defaults, establish this inventory.

## Task 12 source package — not installed or approved for activation

The ordered manifest is `supabase/drawing-cutover-package.json`. Supabase CLI
2.120.0 was discovered in the existing local cache; `--version` and `migration
new --help` were read before four separate successful `migration new` calls.
No timestamps were invented or renamed. Exact resulting payloads:

| Order / dependency | Migration path | SHA-256 |
| --- | --- | --- |
| 1 / prerequisite files and direct auth/workflow roster in manifest | `supabase/migrations/20261016061756_drawing_reviewed_atomic_commands.sql` | `05e6fd8f5fe3cd32c7cbd1797f543d9eaeb786068db04f3077ac2d6f36032adf` |
| 2 / 20261016061756 | `supabase/migrations/20261016061808_drawing_adopted_source_protection.sql` | `515a9252a76642f9eea51968498cc6fc6f5faf617eda637f28bd3e0d57b32435` |
| 3 / 20261016061808 | `supabase/migrations/20261016061825_drawing_command_write_boundary.sql` | `267522500056c715a0a413bb82dd6f79f4e53f7e8a633a23ee78eeca2699df4e` |
| 4 / 20261016061825 | `supabase/migrations/20261016061838_drawing_source_observation_export.sql` | `0ab8cb29f3c26a0fe6eb1dd435b4628790a268a20ea09e2e6df9ffb4f95a0cf1` |

All four previously UNINSTALLED candidates were explicitly amended to remove
top-level BEGIN/COMMIT. Core create/revise EXECUTE grants were removed; existing
revokes remain. The boundary candidate exposes a private operator-only full
snapshot helper shared by the fingerprint; its physical catalog coverage was
preserved. Previously stamped migration files were not edited. Candidate,
promoted and embedded installer payload bytes must match exactly, including LF
and final newline. Each ledger statement array contains one entire payload.

The validator has no network/database/apply mode. Both required jobs now run
drawing coverage: `ci` runs isolated PGlite behavior; `commercial-postgres` runs
actual PG17 concurrency in a separately created guarded empty loopback database.
The dedicated workflow preserves its four exact candidate filters and also
tracks payload/dependency/package changes. The five production release gates
remain unchanged. Missing/hash-drifted payloads fail, never skip.

The manual procedure and test boundaries are in
`supabase/tests/drawing-set-revision-transaction/README.md`. One transaction
executes SHA-checked whole SQL texts and stamps those same texts, leaving both
mutations effectively disabled and package_review empty. Tests prove a fourth
stamp failure rolls back all payloads/stamps, inherited EXECUTE exposure refuses,
and direct authenticated create/revise are denied without writes before any
TEST-ONLY grants.

Installation does not approve itself. Full source/ownership/caller/guard/helper
classification remains mandatory, including all unresolved Task 1 findings and
sibling compatibility. The manifest's eight direct prerequisite hashes come from
the exact saved Task 1 captures above; they are historical observations with
`approval:false`, not defaults or live approval. The fixed direct roster checks
are supplemental to full classification, not a replacement for the 52 guard/
helper reviews or 105/102 potentially privileged paths. The older collector's
view/rewrite scope is narrower than the full physical runtime snapshot. Review
must cover that full snapshot and the actual transitive dependency/privilege
closure; absent classification remains a stop.

Physical fingerprints cannot move between rehearsals, reinstalls or environments.
After a committed disabled install, a grant-only rollback captures disabled and
prospective enabled state on the SAME installed objects. Separately reviewed
literal hashes control manual activation; mismatch rolls back grants and creates
no approval. No capture auto-fills review inputs. Full snapshot exports contain
function definitions and belong in private review artifacts.

Local package/PGlite results are not hosted acceptance, actual PG17/Deno proof,
or production readiness. New versions are intentionally pending production and
may make production drift red; no ownership override hides them. Root reported
a separate read-only discovery that Supabase GitHub automatic production deploy
and branching were enabled at inspection. Their disablement/verification is a
separate owner-approved prerequisite; this source package does not claim there
is no automatic deployment path or authorize a push, merge, deployment or
production change.
