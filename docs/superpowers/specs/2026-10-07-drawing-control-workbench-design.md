# Drawing Control Workbench Design

## Purpose

Make drawing tracking legible to a steel fabricator or erector without changing the identities of GC issuances, shop drawing sets, sheets, revisions, submittals, transmittals, and work-package release records. A user should answer four questions from one project workspace: which revision is current, who owes the next action, what changed or is blocked, and whether a linked work package can be released.

## User-facing architecture

The Detailing Control Center becomes Drawing Control. Its primary navigation has Action Queue, Shop Drawings, GC Issuances, and Approvals. Historical URLs remain valid and may open a contextual advanced view. Process Board, Approval Matrix, Revision Impact, Holds, Transmittals, Validation, and 3D remain accessible by deep link and a secondary tools menu until their functions are fully represented in context. They are not primary tabs.

Action Queue opens by default and emphasizes owner, due date, source record, affected steel package, blocker, and next permitted action. Shop Drawings keeps a project-wide sheet register with set and revision navigation. Selecting a sheet opens a persistent context panel showing current revision, submittal approval stage and ball-in-court, active holds and RFIs, linked work packages and piece scope, last transmittal, and the next action. GC Issuances remains a separate namespace and can link an issuance to affected shop sets without treating equal sheet numbers as the same record. Approvals uses the governing submittal and its rounds as evidence.

The layout follows existing `--cmd-*` dual-theme tokens: dense drawing-log table, legible sheet numbers and revision stamps, concise executive summary, restrained warning colors, keyboard navigation, and a phone layout that does not truncate the next action. Do not add generic card grids, arbitrary gradients, or fabricated metrics.

## Authority and safety

- `drawing_sets → drawings → drawing_revisions` is the document hierarchy. A sheet has at most one current revision; current does not imply approved.
- `submittals.status` with `ball_in_court` governs the approval stage. `drawings.stage` is legacy/recovery state and cannot override an open governing submittal.
- Revision `release_status` describes distribution/handling of that revision. It does not authorize fabrication. `fab_release_log` and the canonical work-package release are distinct production records.
- The server evaluators `evaluate_fab_release_set` and `evaluate_release_gate` control fabrication readiness. The UI shows their reasons and never creates an independent clearance rule.
- A missing comparison, unknown downstream exposure, missing scoped mapping, or incomplete read is explicitly unknown/review-required, not zero impact or ready.
- The governing submittal selector must agree between UI and SQL. A more recently created draft cannot silently replace an actually submitted round in one surface but not the other.
- Project and organization RLS, role floors, and audit trails remain enforced by the database.

## Intake and revision journey

One intake journey begins with an explicit choice of incoming GC document or shop drawing/revision. The preview identifies each sheet by source PDF page, proposed number/title/revision, match status, comparison evidence, and human attestations. The operator confirms matches and saves deliberately. Scanned-PDF assistance may suggest values from page images, but must expose its source and never infer IFC, approval, or fabrication release. A failed extraction preserves the file and offers manual entry. Ambiguous matches require a human decision. A revision cannot silently supersede a different set's sheet.

## Rollout and acceptance

1. Align the authority/read model and close any misleading release-label or governing-submittal differences. Add focused tests for no governing submittal, R&R, unknown evidence, cross-project access, and a revised sheet with a hold.
2. Ship the four-area workbench and context panel, preserving old URLs and familiar domain actions. Complete large registers rather than accepting a silent row cap; virtualize where needed.
3. Unite PDF preflight and the explicit commit handoff, keeping GC and shop records separate and reviewed.
4. Validate with steel scenarios: a revised S-sheet affects linked work packages and leaf pieces; a hold or unresolved RFI stops release and updates each relevant surface; clearing it restores agreement. Verify desktop and field-sized layouts, role permissions, empty/error states, keyboard access, and audit history.

No deployment is implied by a green frontend build. Any new SQL is staged and validated with a committed migration whose filename matches its ledger stamp before production release.
