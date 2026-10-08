# Reviewed shop drawing revision: transactional candidate

**Status:** local, unapplied, not wired to the browser. The candidate is
`supabase/migrations_quarantine/20261008032840_transactional_reviewed_shop_drawing_revision.sql`.
SHA-256: `4a34d5dedea0566b661ce38e97884b3fca9e250b92927d7842bd575993b16d8c`.
Its committed file and ledger stamp must match before any hosted rollout; the
repository's manual migration contract forbids `supabase db push` and MCP
`apply_migration` for this shared project.

The current `RevisionUploadModal.jsx` uploads a PDF, reviews extracted pages,
then writes each sheet, history row, and set header separately. It now defers
the header until sheet writes succeed and reports partial failures, but there
is no database transaction across that sequence. The candidate RPC gives a
future reviewed handoff one Postgres statement. On an error, sheet, revision,
header, audit-trigger, and idempotency-ledger writes roll back together. The
Storage upload happens first and remains outside that transaction, so an
unreferenced PDF object may need cleanup after a failed call.

## Contract

`apply_reviewed_shop_drawing_revision(project_id, drawing_set_id, request_id,
expected_set_updated_at, expected_set_revision, revision_label, issued_date,
issued_by, notes, previous_disposition, file_path, reviewed_sheets)` requires a
signed-in PM or higher. The request key is unique within a project. A retry by
the same actor with byte-equivalent JSONB content returns the prior result;
reusing the key with different content fails. The response names every new
`drawing_revision_id`, `sheet_number`, 1-based source `pdf_page`, and private
Storage path. The database checks that the object exists in `app-files` at the
project's `org_id/uploads/*.pdf` path. It cannot inspect PDF pixels or prove
the page count; the Document Control review must do that before calling it.

`reviewed_sheets` is the **complete current live roster**, including unchanged
sheets. Existing entries carry `drawing_id`, the raw `updated_at` string from
the register, `expected_revision_id` (explicitly null if none), exact
`sheet_number`, and action `same`, `revised`, or `removed`. New entries use
`added`. Changed/new entries require `reviewed: true`, a nonblank title and
revision code, and the confirmed 1-based PDF page. `extracted_text` and
`callouts` are optional: omitted means the page was not harvested, rather than
an observed blank. The RPC checks the set and each sheet/revision version under
row locks, rejects missing/duplicate/foreign rows, and refuses name-only legacy
sheet relationships. It refuses a locked set, active zones on a revised sheet,
and an active hold on a removed sheet. A removed sheet is soft-deleted for
history and excluded from the new live count.

New current revisions start `received`; revised drawings reset to `Not Started`;
the set header becomes `pending_review`, clears the old current-submittal
pointer and approval fields, and snapshots the prior approval in
`revision_history`. No approval, IFC, or fabrication-release status is advanced
by this RPC. Any active linked `Shop Drawing` submittal already at Approved,
Approved as Noted, or Released for Fabrication blocks the call. This is
intentional: the existing fabrication gate can otherwise select that older
submittal for a newly received sheet revision.

## Prerequisites before browser wiring

1. Make exact submittal-round evidence authoritative. A small immutable
   `submittal_round_revision_evidence` manifest should bind each submitted
   round to every current `drawing_revision_id` in each linked set, with
   project-consistent foreign keys and a source path/page snapshot. Capture it
   transactionally at actual submission, never during revision upload. The
   fabrication gate must require one governing approved/released Shop Drawing
   round whose manifest covers **every** current live sheet revision. An old
   round's IDs will then stop matching as soon as a new revision is applied.
2. Converge submit paths on that transaction. `roundWorkflow.addSubmittalRound`
   powers the main status advance; `useSubmittalRoundMutations.createRound`
   powers `NewRoundModal`; `SubmittalFormModal` can seed a directly Submitted
   parent. Current `submittal_sheet_responses` has drawing IDs but no exact
   revision IDs and may be absent on accepted sheets, so it is not a manifest.
   A database guard must also reject direct Submitted/approval writes that
   bypass the manifest RPC.
3. Reconcile legacy approved sets explicitly. Do not infer coverage from
   revision labels, issue dates, or set names. A PM should inspect the actual
   transmitted PDF/transmittal and attest exact revision IDs, or resubmit the
   current sheets. Stage a coverage report and reconciliation workflow before
   turning the gate on for existing projects; an empty manifest would block
   all legacy approvals.
4. Move active zone/link carry-forward into the same RPC (or a separately
   reviewed atomic companion) before enabling those sheets. The current client
   helper clones zones and links after minting a revision; silently omitting
   them would lose coordination context. Also harden legacy
   `publish_drawing_revision` so archived history cannot be reselected as
   current after this RPC commits.

## Local evidence and limits

Run `npm ci && npm test` in `supabase/tests/drawing-revision-atomic`. The PGlite
harness executes the actual migration against a minimal schema and exercises a
reviewed changed/unchanged/added issue, exact page and private path, replay,
key collision, stale set/row/current revision, duplicate revision code,
cross-project drawing, missing/foreign storage object, active zone, approved
submittal, active hold on removal, rollback after an earlier sheet mutation,
removal, PM denial, and pre-register history backfill.

On 2026-10-07, a read-only staging catalog check confirmed the expected
columns, the one-current/code/version unique indexes, and the existing
audit, count-sync, set-lock, and updated-at triggers on the target tables.
`npm ci --ignore-scripts` and `npm test` both exited 0 locally after the final
candidate edit. No hosted DDL or user data was changed.

PGlite is single-connection and uses a reduced schema. It does **not** prove
hosted Storage permissions, MFA pre-request enforcement, the complete trigger
graph/RLS, concurrent request-key waits, or large-set latency. Before approval
to apply, rehearse the full schema on staging with two authenticated PM
sessions; verify conflicting concurrent requests serialize, a viewer/foreign
project cannot invoke the RPC, failed calls leave no rows, and all four linked
register/fabrication surfaces agree on the new pending-review blocker.
