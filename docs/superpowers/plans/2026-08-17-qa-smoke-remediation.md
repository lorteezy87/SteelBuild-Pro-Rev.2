# QA Smoke Remediation Implementation Plan

**Goal:** Resolve every issue found in the 2026-08-17 BIMC ED Expansion smoke test without regressing the working Notes, Piece Register, revision-impact, or Detailing Hub flows.

**Approach:** Repair the shared authorities behind the symptoms, add regression coverage at each boundary, then validate the authenticated workflows in the browser. Production Notes requires both application hardening and deployment of the already-reviewed folder migration because the live database does not yet contain its tables, column, or RPCs.

## Task 1: Backup workflow environment collision

- Update `scripts/__tests__/storageBackupWorkflow.test.mjs` to reject reserved `RCLONE_*` installer variables.
- Rename the workflow installer variables to `INSTALL_RCLONE_VERSION` and `INSTALL_RCLONE_SHA256`.
- Run the focused workflow test and the repository workflow checks.

## Task 2: Navigation, billing, and unknown-route session safety

- Add regression expectations for Production Notes sidebar discoverability and ungated Billing access.
- Make Billing an account/admin route independent of the optional cost module.
- Place the unknown-route page inside the authenticated layout and remove its independent auth request.
- Add focused route and not-found tests proving unknown URLs do not revalidate or sign out the session.

## Task 3: Production Notes reliability

- Add visible folder-load failure and retry behavior; disable folder-dependent actions until folders are available.
- Preserve the existing note and ink behavior.
- Run the folder migration tests.
- Apply the existing reviewed `note_folders_job_linking` migration to the linked production project and reconcile note counts, RPCs, RLS, grants, and advisors.

## Task 4: Submittals and RFI interaction cleanup

- Add an embedded Submittals mode for the Drawing/Submittal Hub so only one toolbar, title, and KPI layer renders.
- Preserve the standalone Submittals page.
- Add component acceptance tests for the RFI close button and row-checkbox-to-delete flow; change production code only if those tests expose a wiring defect.

## Task 5: Canonical overdue counts

- Define one package overdue calculation using the governing submittal date, sheet-date fallback, and closed-state exclusions.
- Use it in Drawings, the Drawing/Submittal Hub, and Drawing Register derivations.
- Keep unlinked overdue submittals visible as a separate workflow count so they cannot silently inflate the drawing-package KPI.

## Task 6: Fabrication release parity

- Build the recent-release list from the same canonical released package set used by the released count.
- Include released packages whose release date was not recorded and render that state explicitly.
- Add the invariant test that a positive released count cannot produce an empty recent-release panel.

## Task 7: Verification and delivery

- Run focused tests after each fix, then typecheck/lint/build/full unit tests and Supabase migration tests.
- Browser-test the BIMC ED Expansion workflows, including direct unknown URLs, Production Notes folder creation, Billing, Submittals, RFIs, overdue parity, and Fab Release.
- Confirm `QA smoke 2026-08-17` remains present.
- Review the diff, release the coordination claim, publish the branch, and open a PR with evidence and any production-only constraint stated plainly.
