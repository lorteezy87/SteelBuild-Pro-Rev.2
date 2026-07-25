# Drawing Approval Lifecycle — Slice 6: Piece / Register Exposure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Align piece-control drawing readiness with submittal-derived **IFC /
Released** (not bare Approved/AAN / OFS), fail-closed on R&R/OFS/non-IFC, and
surface a Piece Impact panel with exposure flags.

## Product decisions

1. Release-ready = governing workflow stage IFC or Released (or fab signoff).
2. OFS / R&R / BFA / OFA are **not** release-ready.
3. Client `isDrawingApproved` and SQL `piece_control_drawing_is_approved` agree.
4. Piece Impact: governing sheet/rev/stage + exposure flags.
5. KPIs stay on `selectActionableLeafPieces`. Package fabReleaseGate unify → Slice 8.

## Tasks

- [x] Claim + plan
- [x] `drawingReleaseReady` pure helpers + tests
- [x] Align `readiness.ts` + SQL migration
- [x] Extend relationship snapshot (BIC, comments, rev code)
- [x] Piece Impact panel + wire Piece Register
- [x] Verify + commit + PR
