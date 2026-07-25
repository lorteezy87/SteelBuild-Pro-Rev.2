# Drawing Approval Lifecycle — Slice 0/1: R&R as a First-Class Workflow Stage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Promote R&R (Revise & Resubmit) from an "IFA rollup + badge" to a
first-class **derived workflow stage** across every submittal-governed surface,
without touching the `drawings.stage` DB CHECK or writing "R&R" to any sheet row.

**Architecture:** Display-only derivation change. `submittals.status` +
`ball_in_court` remain the workflow source of truth (§20). `submittalStatusToStage`
returns `"R&R"` for R&R/Rejected outcomes instead of `"IFA"`. A new
`WORKFLOW_STAGE_ORDER` (8 stages, R&R after BFA) drives display surfaces; the
7-stage `STAGE_ORDER` remains the sheet-enum (`drawings.stage`) source for all
write paths.

**Tech Stack:** Vite + React 18 + TS, Vitest (node env), no DB migration in this slice.

## Global Constraints

- No DB migration; `chk_drawings_stage` (7 values) untouched; "R&R" is never
  written to `drawings.stage`.
- `STAGES` / `STAGE_ORDER` in `drawingsConfig.js` keep exactly 7 entries (sheet
  write paths: BulkActionBar, AdvanceStageDialog legacy, DrawingKanban, sort).
- `STAGE_MAP` becomes a superset lookup (8 entries) so chips can render R&R.
- Health scoring is byte-identical: `drawingHealthScore` maps stage "R&R" → IFA
  index before computing the approval deduction.
- `isStageInReview("R&R") === true` (R&R sets counted in-review today via IFA).
- Full suite + lint + build green before commit; Conventional Commits.

## Product decisions locked for this slice (from 2026-07-25 planning report)

1. R&R kept as status string `"Revise and Resubmit"` / `"Rejected"`; the STAGE
   becomes `"R&R"` (derivation change only — no stored stage column).
2. R&R placed after BFA in workflow display order:
   `Not Started → IFA → OFA → BFA → R&R → OFS → IFC → Released`
   (R&R results from a BFA disposition; loops forward to OFA on resubmit).
3. R&R chip color: amber `#F59E0B` (matches existing RRBadge / STATUS_COLORS).
4. `stageToSubmittalStatus("R&R")` → `{ status: "Revise and Resubmit",
   ball_in_court: "Detailer" }` (detailer owns the ball in R&R).
5. Action engine parity: stage "R&R" → next move "Resubmit for Approval (OFA)"
   (identical outcome to the pre-change IFA derivation for R&R statuses).
6. Later slices (2+: cycle history, R&R transmission-evidence gate, OFS
   completion checklist, comment dispositions, release-gate unification) are in
   the 2026-07-25 planning report and are NOT in scope here.

## Files

- Modify: `src/components/drawings/drawingsConfig.js` (add `RR_STAGE`,
  `WORKFLOW_STAGES`, `WORKFLOW_STAGE_ORDER`; STAGE_MAP from WORKFLOW_STAGES)
- Modify: `src/lib/submittalStageMapping.ts` (R&R stage; isStageInReview;
  stageToSubmittalStatus; header docs)
- Modify: `src/lib/detailingPackageState.js` (DETAILING_STATE_ORDER from
  WORKFLOW_STAGE_ORDER)
- Modify: `src/lib/submittalActionEngine.ts` (case "R&R")
- Modify: `src/components/submittals/ProcessBoardPanel.tsx`,
  `src/components/submittals/SubmittalVisualBoard.jsx` (R&R column)
- Modify: `src/pages/drawingSubmittalHub/format.ts` (WORKFLOW_STAGE_STATES,
  buildDrawingKpis in-review, getOperationalStateColor)
- Modify: `src/services/drawingHealthScore.ts` (R&R → IFA index, score parity)
- Tests: `src/lib/__tests__/submittalStageMapping.test.js`,
  `src/lib/__tests__/detailingPackageState.test.js`,
  `src/lib/__tests__/submittalActionEngine.test.ts`,
  `src/__tests__/drawingsSubmittalCohesion.test.js`,
  `src/components/submittals/__tests__/processBoard.derive.test.ts`,
  `src/pages/drawingSubmittalHub/__tests__/format.test.ts`, plus any suite
  breakage surfaced by `npm test`.

## Acceptance criteria

- An R&R/Rejected submittal derives stage "R&R" (not "IFA") everywhere the
  derived stage is shown: process boards (own column), drawing register
  effective state, hub KPIs (counted in-review), Submittal Register stage chip.
- No sheet-stage write path offers or writes "R&R".
- Health scores unchanged for identical inputs.
- `npm run lint`, `npm test`, `npm run build` all green.
