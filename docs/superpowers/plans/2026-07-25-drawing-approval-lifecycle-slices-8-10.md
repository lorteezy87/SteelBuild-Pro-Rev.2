# Drawing Approval Lifecycle — Slices 8–10

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

## Slice 8 — Package fab-release gate unify
- `isApprovedForFab` ≡ Slice 6 IFC/Released readiness (not bare Approved/AAN/ifc_status)
- Gate blocks non-IFC package membership; SQL `evaluate_fab_release_package` agrees
- Analytics `drawingIsReleasedForFab` aligned; E2E contract unchanged (RFI gate)

## Slice 9 — Dashboard SoT
- Document Hub STAGE maps include R&R
- DrawingApprovalStatusCard / SteelExecutionStatusCard use submittal-derived IFC/Released semantics
- Cohesion with `submittalPipelineRollupFromSubmittals`

## Slice 10 — Legacy cleanup
- Remove unreachable DrawingKanban
- Scrub stale “R&R → IFA” product copy
- Document remaining dual-source (sheet enum vs submittal derivation vs fab_release_log)

## Tasks
- [ ] Claim + plan
- [ ] Slice 8 implementation + tests
- [ ] Slice 9 implementation + tests
- [ ] Slice 10 cleanup + docs
- [ ] Verify + commit + PR
