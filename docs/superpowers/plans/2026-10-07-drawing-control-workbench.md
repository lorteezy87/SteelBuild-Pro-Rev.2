# Drawing Control Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give steel subcontractors one reliable place to track current shop sheets, GC issuances, approvals, blockers, and the next release action.

**Architecture:** Keep existing Supabase entities and server gates. Consolidate navigation and build a project-scoped sheet context from complete, authoritative reads. Reconcile competing approval selectors and make intake review flow into an explicit commit.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Supabase/Postgres, Vitest, existing command CSS tokens.

**Spec:** `docs/superpowers/specs/2026-10-07-drawing-control-workbench-design.md`

## Global Constraints

- New source modules are TypeScript; preserve old deep links.
- GC-issued documents and shop sheets have different IDs and records.
- Approval, revision distribution, and fabrication release are distinct.
- No browser-derived release authority; server gates own release.
- Unknown evidence remains unknown, never zero or clear.
- No `supabase db push` or MCP `apply_migration`; use a matching hand-stamped ledger version if SQL is deployed.
- Keep dual-theme `--cmd-*` tokens and project/organization boundaries.

## Review Focus

- A newer unsubmitted draft versus an older submitted round: all screens and the server choose the same governing submittal.
- A sheet revised after fabrication begins: affected scope is shown, and missing evidence cannot appear ready.
- A shop sheet and GC sheet with the same number: neither overwrites nor authorizes the other.
- A project beyond 1,000 sheets: no silent truncation or hidden bulk selection.
- Intake interrupted after review: the app does not claim the drawing was saved or lose human attestations silently.

---

### Task 1: Authority and release vocabulary

**Files:** `src/lib/submittalStageMapping.ts`, focused tests, and a candidate SQL migration or reviewed SQL design document.

**Interfaces:** Preserve `pickMostRecentSubmittal`; produce one explicit governing-order rule for SQL and client. Keep `publish_drawing_revision` distribution separate from package release.

- [x] Add tests for submitted-date, updated-date, round ties, Void, no submittal, and release-label separation; verify red.
- [x] Implement the matching client/server selector or a staged SQL candidate with exact verification evidence; verify green locally.
- [x] Document backend changes that cannot be applied safely in this session.

### Task 2: Workbench navigation and sheet context

**Files:** `src/pages/DrawingSubmittalHub.tsx`, `src/pages/drawingSubmittalHub/*` (excluding `EscalateModal.tsx`), `src/components/drawings/register/*`, and scoped tests/CSS.

**Interfaces:** Four primary areas; existing `hub_tab` URLs still resolve. Sheet context uses current revision, governing submittal, active hold/RFI, transmittal, and exact work-package links; each fact names its source or unavailable state.

- [x] Add behavior tests for visible primary navigation, deep-link preservation, sheet selection, and unknown evidence; verify red.
- [x] Implement contextual navigation and a persistent sheet panel using existing project queries and `--cmd-*` tokens; verify green locally.
- [ ] Check keyboard behavior, narrow layout, selection scope, and complete large-register reads.

### Task 3: Reviewed intake handoff

**Files:** `src/pages/DocumentControl.tsx`, drawing intake components/utilities, and focused tests.

**Interfaces:** Source-page evidence and human attestations survive from preflight to explicit shop-revision or GC intake commit. Scanned-PDF extraction remains advisory; ambiguous matches require review.

- [x] Add tests for source choice, scanned/manual path, ambiguous match, and interrupted review; verify red.
- [x] Implement a reviewed handoff to the existing save workflow or a scoped recoverable draft; verify green locally.
- [x] Confirm a preview never writes, approves, or releases.

### Task 4: Release consistency and final validation

**Files:** focused tests, drawing release evidence panels, rollout notes.

**Interfaces:** Drawing Control, package release, and piece/work-package context display one authoritative blocker and the same remediation link.

- [x] Run targeted drawing tests, the full suite, lint/typecheck ratchets, and build.
- [ ] Exercise revised-sheet, hold, RFI, cleared-hold, cross-project, and large-register scenarios. Record any missing hosted evidence honestly.
- [ ] Review the diff independently, correct findings, commit the scoped change, and release the claim.
