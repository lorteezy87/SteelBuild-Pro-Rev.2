# Exact shop-drawing round revision evidence

Source candidate: `20261009070300_submittal_round_revision_evidence.sql`,
generated with Supabase CLI 2.120.0. This document records source behavior, not
deployment. Apply and stamp the exact committed bytes manually only after the
reviewed staging and release checks; never `db push` or MCP `apply_migration`.

The user approved this design in **Create SteelBuild Pro site**, then requested
full production currency and security hardening. This continues that approved
design and preserves the original claim. The five Drawing Control prerequisite
migrations remain byte-identical; the upload RPC in migrations_quarantine is
still frozen because zone/link carry-forward is not implemented.

## API

`apply_submittal_round_workflow(p_submittal_id uuid, p_request_id uuid,
p_expected_updated_at timestamptz, p_expected_status text,
p_expected_current_round_id uuid, p_expected_revision_ids uuid[], p_patch jsonb,
p_new_round boolean default false)` returns `{submittal, round, evidence}`.

The complete exact current revision roster spans every linked set. Requests
require PM access and satisfaction of the existing enrolled-MFA policy, expected parent timestamp/status/round, and
a stable request UUID. Same actor plus identical JSONB command replays the prior
result; a different command using that UUID fails. Dates retain database
microseconds. Never retry a stale command with silently replaced expectations.
The policy requires AAL2 when the user has a verified factor; it does not itself
mandate enrollment for every user.

Patch fields are limited to status, ball_in_court, submitted_date, returned_date,
response_notes, submitted_by, reviewer, file_url, markup_file_url, revision,
approved_date, required_date, notes, fab_release_override_reason,
gate_override_reason, and metadata. Metadata can merge only ofs_checklist,
ofs_override_reason, comment_override_reason, workflow_substatus. Existing
status, OFS checklist, required-comment, fabrication and audit triggers remain
active in the transaction. New round numbers are assigned under the parent
lock. Direct Shop Drawing lifecycle/round writes are rejected. Create a Draft
first, review its sources, then use the command; imported approval is not
silently treated as evidence.
Corrective transitions to Draft, Void, Revise and Resubmit or Rejected retain
authorization, parent-version checks and existing legal transition rules, but do
not require complete sources or capture approval evidence. Existing source rows
are still locked. An unlinked Draft can be voided; a missing PDF can be returned
for correction, while resubmission remains blocked until sources are complete.
Rejected → Draft → Submitted starts a new reviewed round.

`reconcile_submittal_round_evidence` accepts the same first six arguments plus
`p_attestation text`. A PM must inspect the original transmission and attest
the precise revision IDs; the text must contain at least 20 characters. It
creates evidence for a legacy round without granting or changing approval.
Existing evidence cannot be rewritten. If transmitted revisions do not match
the current register, resubmit instead. No automatic backfill occurs.
A released legacy package may have a null current ball-in-court or no round;
reconciliation supports both without inventing a recipient. The actual submission
date is still required. A missing date requires explicit correction/review or a
new submission, never a guessed date.

`get_submittal_revision_coverage(p_submittal_id uuid)` returns project_id,
submittal_id, submittal_status, submittal_updated_at, round_id, ok, reason,
current_revision_ids, captured_revision_ids, missing_revision_ids,
stale_revision_ids, missing_current_drawing_ids, foreign_drawing_set_ids,
empty_drawing_set_ids, evidence. `get_submittal_revision_coverages(uuid[])`
returns an array of these objects with `evidence: []` to omit heavy source
snapshots from register/dashboard payloads, at most 200 IDs per call. The single
record endpoint retains full evidence for review. Missing or
unauthorized IDs fail the whole read. Client hydration must reject a status or
timestamp mismatch between its parent snapshot and this coverage snapshot.

## Evidence and release rules

Evidence contains project, submittal, round, set, drawing and revision IDs,
exact file_url, canonical storage_path, positive 1-based pdf_page, revision_code,
captured_by/at, capture_kind, and explicit attestation for legacy reconciliation.
It also captures the Storage object UUID, version, update timestamp, eTag and
metadata. Same-path replacement, disappearance, or metadata change invalidates
coverage as `stale_manifest`. This preserves an immutable database source
snapshot, not immutable PDF bytes: retained versioned copies and independent
content hashing are outside this candidate.
Composite foreign keys enforce project/parent consistency; one row exists per
round/revision and round/drawing. Source files must be existing app-files
objects at the project's organization's uploads PDF path (optionally the
app-files/ prefix). A transient URL or missing page must be corrected in the
register before capture. The database cannot inspect PDF pixels.

Evidence is append-only. FK-driven Auth author removal may clear captured_by
only with an absent Auth parent, nested trigger and identical remaining fields,
matching the existing account-erasure authorship pattern. Source identity and
PDF/page/code cannot be edited on a captured revision. Historical evidence
survives sheet soft deletion and supersession. A new revision, added/removed
sheet, empty set, foreign set, missing current revision or changed round roster
blocks release. Explicit fab override never fabricates or replaces evidence.
The actual admin project archive command can tombstone a round only after its
parent is archived, with the identical archive timestamp and no lifecycle or
source edits. PM/MFA/workspace checks remain enforced; historical evidence stays
present until the separately authorized project-erasure command.

The set evaluator retains `drawing-shop-v2` compatibility and all prior
holds/RFIs/signoffs/distribution checks, adding revision_manifest_mismatch with
the coverage report. It checks the governing round across all linked sets,
including siblings outside the currently displayed set. Archived, superseded,
void or older active revisions cannot be republished through the legacy RPC.

## Locking and security

The workflow takes a request-key advisory lock, locks the submittal, then sorted
sets FOR UPDATE, drawings FOR UPDATE, their revisions FOR UPDATE and the round.
The migration asserts validated non-deferrable drawing-to-set and
revision-to-drawing foreign keys on the exact columns. These parent-key locks
block incoming sheets/revisions until capture finishes. The roster is refreshed
after waits. Legacy writers using reverse lock order can receive an ordinary
database deadlock/serialization error; the statement and receipt roll back and
the user must reload/review before retrying a changed command.
Storage objects are share-locked in sorted path/UUID order after drawing/revision
locks. Metadata is re-read after waits; a later Storage update waits for capture
to commit and then invalidates coverage.

A private context row keyed by transaction, backend and submittal grants the
temporary write authority; caller-controlled GUCs do not. The private schema,
tables and internal functions grant no client/service-role access. Public
commands explicitly revoke anon and service-role execution and require PM/MFA.
Evidence SELECT has project RLS plus MFA; direct writes have no grant. Public
coverage permits authorized project reads (and trusted service-role reads).

Unique indexes on existing identity columns require brief DDL locks. Review
table sizes, active transactions, lock timeout and staging timing before apply.
Production legacy approvals with no manifest intentionally fail closed until
PM reconciliation/resubmission; report the actual affected count before release.

## Verification boundary

The dedicated PGlite suite passes 27 behavioral checks. The PostgreSQL suite
includes 18 independent-session scenarios; it is a required CI step. The earlier
12-scenario head `79306342e` passed commercial CI job `113725795662`; the final
source additionally tests object-update waits, post-capture replacement,
PM/workspace/MFA revocation during object waits, and a return approval racing a
source replacement. Both captures and return approvals lock source objects before
evaluating coverage and recheck authority after those waits.

On 2026-10-09 the exact candidate with SHA-256
`b4b77581e51a0c61ee63d47fa34d1010a123bb1759bee6889e0ca0ec719b0ea7`
passed **31 hosted staging assertions** on `ndyfjffsulfbwpmwdmic` in one rolled-back
transaction. The rehearsal used actual Auth/MFA, workspace/project permissions,
Storage RLS, installed workflow/audit triggers, and installed soft/hard erasure
commands. It covered two-set capture/replay, PM/viewer/foreign-membership/AAL
denials, existing OFS checks, legacy reconciliation, non-Shop submission, new
revision invalidation, corrective/void transitions with missing sources,
Rejected-to-Draft resubmission, linked Product Data, R&R, storage source changes, Auth FK cleanup and project
erasure. No policies or triggers were disabled. Storage tests changed only
synthetic metadata; they did not upload, read or delete PDF bytes.

The rehearsal caught and fixed a round-archive incompatibility that the reduced
fixture had missed. The local fixture now invokes the real `soft_delete_project`
function before hard erasure. Post-rollback verification found no candidate table
or ledger stamp and zero synthetic users, organizations, projects or Storage
metadata. `hosted-rollback.ts` prints the exact reviewable query; it never connects
to a database or reads credentials. The separate hosted concurrency check still
runs in the isolated PostgreSQL 17 CI database, not against customer rows.

Rendered client integration and operational approval of affected legacy records
remain release acceptance work. No production migration or source ledger stamp
is implied by this document.

## Production impact inventory (read-only, 2026-10-09)

Active projects contain 22 active Shop Drawing submittals: 9 Approved as Noted,
6 Released for Fabrication, 3 Submitted, 2 Under Review and 2 Draft. All 20
non-Draft packages lack this new manifest and require reviewed reconciliation or
resubmission; none are auto-attested. Five of the 15 approved/released packages
have no current round. All 22 have a submission date. These are package counts,
not a claim that every package currently governs a live set. Index targets are
small at this observation (drawing table 3.74 MB, remaining individual targets
under 0.65 MB), but application still requires bounded lock timeouts.

The post-rollback staging security advisor reports existing private-table
[no-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[definer-function review notices](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
and [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Because the candidate was rolled back, that advisor output does not validate its
new objects; the rehearsal independently checked public command grants, private
schema isolation and evidence RLS.
