# Drawing workflow dual-source (Slice 10)

SteelBuild keeps three related but distinct notions of “release / approval.”
Do not collapse them without an explicit migration.

## 1. Submittal-derived workflow stage (SoT for boards / KPIs / gates)

- Source: `submittals.status` + `ball_in_court`
- Mapper: `submittalStatusToStage` →
  `Not Started → IFA → OFA → BFA → R&R → OFS → IFC → Released`
- `"R&R"` is **display-only** — never written to `drawings.stage`
- Used by: Process Board, Document Hub, piece readiness, package
  `isApprovedForFab` / `piece_control_drawing_is_approved` (IFC/Released)

## 2. Sheet-stage enum (`drawings.stage`)

- CHECK constraint: 7 values
  (`Not Started`, `IFA`, `OFA`, `BFA`, `OFS`, `IFC`, `Released`)
- Recovery / legacy writes when a set has **no open** governing submittal
  (`classifyDrawingStageMutation`, Advance Stage dialog). Closed linked
  submittals still allow sheet-stage sync so the Drawings register can
  catch up after the workflow moved in Submittals.
- Prefer creating/updating a submittal instead of mutating sheet stage
  while any linked submittal is still open

## 3. Fabrication release audit (`fab_release_log`)

- Append-only package release events with override reason + blocking RFI snapshot
- Server gate: `evaluate_fab_release_package` + insert trigger
- Distinct from submittal status `"Released for Fabrication"` and from
  work-package canonical piece release

## Also distinct

- `submittal_components.is_released` — per drawing-type (S/E/P) release
- Work-package `release_work_package_canonical` — piece-control WP release

## Removed in Slice 10

- Unreachable `DrawingKanban` sheet-stage board (hub uses Process Board)
