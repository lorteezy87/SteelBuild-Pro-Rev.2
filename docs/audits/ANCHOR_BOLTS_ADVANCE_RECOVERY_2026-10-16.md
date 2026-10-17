# Anchor Bolts advance investigation

Production publication remains on hold. This change only repairs rejected-command recovery; it does not approve a package, reconcile evidence, change SQL guards, or establish the exact backend cause of the reported rejection.

## Read-only production findings

- Affected package: AMS Mesa / SUB-001 Anchor Bolts, submittal `3201ffab-d2f8-481c-845c-6e3177437d85`.
- The persisted status changed from Approved as Noted to Released for Fabrication on October 16 at 08:50:26 Arizona time. The current round has the same status and roster.
- Three captured revision snapshots match the current revisions and Storage object identity, version, timestamps, metadata and ETag. The installed coverage function returns `ok: true`, `reason: complete`.
- The authenticated detail view independently reports exact revision evidence verified and disables its terminal advance CTA.
- Four database errors report `ROUND_LEGACY_RECONCILIATION_REQUIRED` around 23:10–23:12 Arizona time. The user confirms a new attempt that evening. Available error logs contain the RPC name but neither its argument values nor the failing coverage reason; they cannot conclusively correlate the payload or explain the discrepancy with current coverage.
- Production records, functions and deployment were not changed. No approval was retried or reset to reproduce the incident.

## Confirmed recovery defect and correction

The advance mutation refreshed registers after success but only cleared the pending action and displayed raw SQL text after rejection. An older tab could retain its old workflow state and evidence indefinitely after rejection.

Rejected ordinary advances now invalidate the project register, round history, drawing families and the affected package's revision coverage/document queries. Active queries reload the saved state. No workflow write is retried, no success toast is emitted, and the original error remains visible even if refreshing fails. Fabrication RFI override handling is unchanged. Evidence errors explain where to review the package and distinguish original-transmission reconciliation from a new submission for changed PDFs.

## Verification and remaining scope

The new mutation regression and message regression fail before the implementation. Focused recovery, evidence-review and release-authority tests pass. The recovery regression subscribes to an old Approved as Noted package, rejects its release command, and verifies that the active query fetches the saved Released for Fabrication package exactly once without another command or success notification.

This fixes a reproduced recovery defect. It does not prove that stale UI state caused the original SQL coverage rejection. If that rejection recurs with current evidence, capture its request identifier and coverage reason before considering a server change. Do not weaken the evidence guard or auto-attest the historical transmission.
