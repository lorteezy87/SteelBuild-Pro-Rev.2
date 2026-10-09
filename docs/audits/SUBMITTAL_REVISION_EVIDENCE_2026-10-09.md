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
require PM access and enrolled MFA, expected parent timestamp/status/round, and
a stable request UUID. Same actor plus identical JSONB command replays the prior
result; a different command using that UUID fails. Dates retain database
microseconds. Never retry a stale command with silently replaced expectations.

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

`reconcile_submittal_round_evidence` accepts the same first six arguments plus
`p_attestation text`. A PM must inspect the original transmission and attest
the precise revision IDs; the text must contain at least 20 characters. It
creates evidence for a legacy round without granting or changing approval.
Existing evidence cannot be rewritten. If transmitted revisions do not match
the current register, resubmit instead. No automatic backfill occurs.

`get_submittal_revision_coverage(p_submittal_id uuid)` returns project_id,
submittal_id, submittal_status, submittal_updated_at, round_id, ok, reason,
current_revision_ids, captured_revision_ids, missing_revision_ids,
stale_revision_ids, missing_current_drawing_ids, foreign_drawing_set_ids,
empty_drawing_set_ids, evidence. `get_submittal_revision_coverages(uuid[])`
returns an array of these objects, at most 200 IDs per call. Missing or
unauthorized IDs fail the whole read. Client hydration must reject a status or
timestamp mismatch between its parent snapshot and this coverage snapshot.

## Evidence and release rules

Evidence contains project, submittal, round, set, drawing and revision IDs,
exact file_url, canonical storage_path, positive 1-based pdf_page, revision_code,
captured_by/at, capture_kind, and explicit attestation for legacy reconciliation.
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

The dedicated PGlite behavioral suite passes locally. PostgreSQL concurrency
checks are a required CI step, and hosted staging acceptance is still required.
No production migration or source ledger stamp is implied by this document.
