# SteelBuild Pro — full application rebuild

Owner scope reaffirmed October 7, 2026: rebuild the complete application for
structural-steel fabrication and erection subcontractors. The dashboard work,
security hardening and proposed AI features are parts of that program. None is
a substitute for completing and accepting the operational modules.

## Verified starting point

The supplied `10.7.26.zip` contains 2,907 regular files, each byte-identical to
`main` at `948c7de7342539a95450d1c014c9991e88ba9be0`. Archive SHA-256:
`0aebb308507ae2ac3a80c39fed8b2bf80a499377e1e9e5d9278a899ce6b52da3`.
The comparison inspected archive bytes without extracting or executing them.
It found no unsafe paths. This is a source backup, not evidence of a deployed
version or a restored database.

The existing hardening checkpoint `1bea4b3d523f3720020cc1f43ac8f243b46bd7d6`
preserves that baseline plus 92 changed files and 70 additions. Its verified
security, financial, field replay and executive design work must be retained.
The complete branch is now checked out in the owner's SteelBuild-Pro workspace.

The [baseline module inventory](../audits/FULL_APP_REBUILD_INVENTORY_2026-10-07.md)
accounts for all **78 registered pages** and **38 report destinations**, including
internal and public/support entry points. Existing source is not marked rebuilt
or accepted merely because it exists or because aggregate unit tests pass.

## Completion by business workflow

| Area | Rebuild and acceptance requirements |
| --- | --- |
| Company and project administration | Onboarding, selected workspace/project, membership/roles, settings and billing use consistent context. Verify create/edit/archive, account replacement and failure recovery with authorized and forbidden roles. |
| Engineering and document control | Drawing sets, active revisions, RFIs, submittals and GC documents retain distinct identities and authoritative approval rules. Upload, review, return/revise, supersede, compare and release must lead to the correct records with readable evidence. |
| Fabrication and piece control | Work packages, leaf lots, stations, material readiness, holds and release gates agree about scope and progress. Missing or failed evidence cannot turn into zero pieces, a manual package or a release decision. Blockers need practical source-remediation paths. |
| Scheduling, resources and logistics | Dependencies, inclusive dates, progress, crews and deliveries retain canonical semantics. Re-import must have a defined duplicate/update policy. Clearly distinguish project schedule tasks from separate crew commitments. |
| Field, safety, quality and closeout | Daily logs, photos, installation progress, inspections, incidents, punch work and closeout support the actual foreman's workflow. New versus copied versus edited records must be distinct. Offline identity, destination, retry and deduplication remain explicit. |
| Commercial controls | Contract scope, budget, approved changes, commitments, actuals, SOV, payment applications, retainage and backcharges reconcile. Every permitted disposition collects its required evidence. Partial saves and ambiguous retries must not create duplicate numbered business records. |
| Portfolio, reporting and integrations | Every total and export has a complete, correctly scoped source. Reports distinguish missing evidence from a measured zero. Each connector is either operationally verified or clearly identified as unavailable; saved links are not described as synchronization. |

Each area needs the same construction-specific presentation: clear job identity,
record number, required date, responsibility, controlling evidence and next
action; readable working text; deliberate desktop and field-phone layouts;
keyboard access; meaningful error, pending, empty and stale states. Screens must
be reviewed with realistic records and operational actions, not only an empty
dashboard or a synthetic screenshot.

Design acceptance applies to the working registers, record drawers, imports,
editors, approvals and exports across the app. Use disciplined typography,
consistent column alignment, restrained status color and clear information
hierarchy. Steel-specific identifiers, tonnage, marks, sequences, revisions,
release authority and commercial exposure should determine the layout. The
owner's requirement is a cohesive product designed for construction executives
and field teams; a decorative dashboard does not satisfy that requirement.

## Current implementation slice

The first cross-module continuation repairs four reproduced or source-verified
workflow defects. The [dated implementation record](../audits/FULL_APP_CORE_WORKFLOWS_2026-10-07.md)
contains local automated checks, component visual evidence and remaining limits.
This is one completed implementation batch within the larger rebuild.

| Work item | Required behavior |
| --- | --- |
| Daily-log copy | Copy a previous log into a visibly new draft for the correct local date/project, then use the create/offline-idempotency path. Keep genuine existing records on the update path. Never carry yesterday's record identity or incident evidence into today's log. |
| Payment-application Void | Collect a nonblank reason, preserve permitted role/state rules, cancel without a write, retain the draft on failure, and bind the result to the originating certificate. |
| Work-package evidence | Distinguish initial pending, failed, refreshing and complete source queries. Do not offer evidence-dependent transitions from unknown or incomplete scope. Preserve valid manual packages once absence of pieces is established. |
| Complete-read contract | `listAll` and `filterAll` must reject an unproven result at the safety ceiling instead of resolving a partial array as complete. Keep successful short-page reads and later-page error propagation intact. |

## Remaining verified priorities

- Extend active-workspace scope consistently to Projects and RFI portfolio
  queries; existing RLS-visible cross-company data is not the selected workspace.
  Preserve on-hold projects in the Projects register, reject foreign-workspace
  deep links, and keep failed child reads from appearing as zero cost or progress.
- Make numbered CO/delivery/SOV creation atomic or explicitly recoverable when
  optional required follow-up writes fail.
- Stop converting constraint-engine fetch failure into an empty constraint set.
  Gate the eight required sources as one complete project bundle, retain failure
  identity for Retry, and bind manual constraint mutations to their source draft.
- Resolve the schedule import duplicate policy and the schedule/crew-commitment
  distinction before presenting unified forecasts.
- Give fabrication blockers direct source-remediation actions. Finish readable,
  aligned revision-impact registers, including their virtualized phone layouts.
- Expose the Daily Logs register's intended edit/delete actions. Its current list
  ignores those parent callbacks; editing through a record deep link is supported.
- Repair the shared PhoenixModal accessibility tree: its current hidden backdrop
  encloses the dialog. Verify keyboard and screen-reader behavior across callers.
- Complete the role, volume, integration, monitoring and backup-restore
  acceptance that source inspection and aggregate CI cannot establish.

The inventory records adjacent capability gaps, including dedicated estimating,
takeoff and payroll routes. These are not silently assumed to exist or expanded
into a separate ERP project; product additions must remain tied to the owner's
steel-subcontractor scope.

## AI extensions fit within the full build

The owner's voice, drawing intake, blocker analysis, project-document and visual
communication ideas remain in the [intelligence delivery sequence](STEELBUILD_INTELLIGENCE.md).
The first voice workflow is recorded field update → transcription → existing
daily-log draft → human review/save, once that underlying workflow is sound.
Model IDs, API availability, account access, credentials, spend controls and
evaluations must be verified at implementation time. The supplied model list is
not a deployment record. No new provider work is enabled by this scope document.

## Release truth

The [prior staging acceptance](../audits/STAGING_ACCEPTANCE_2026-10-07.md) remains
valid for its named source and approved seven-migration/seven-function package.
Neither frontend Worker nor production was changed by that release. Two staging
service configurations, five high tooling audit entries, pending production
migrations, native delivery and operational acceptance remain open.

Track source implementation, automated verification, rendered workflow review,
hosted staging acceptance and production deployment separately. The full rebuild
is complete only when the supported workflows meet those applicable gates; a
single improved screen, model integration or passing build is not completion.
