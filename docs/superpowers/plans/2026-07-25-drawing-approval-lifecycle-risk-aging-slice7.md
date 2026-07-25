# Drawing Approval Lifecycle — Slice 7: Risk / Aging / Notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Surface Normal / Attention / Urgent / Critical risk tiers for
time-sensitive workflow stages (**R&R**, **OFS**, **BFA**) and create honest
ActionItem drafts for Critical/overdue cases — without inventing a
`generate-alerts` Edge Function.

## Product decisions

1. Tiers (working days to due, or days-stuck when no due):
   - **Critical** — overdue, due today, or `threateningFab`
   - **Urgent** — 1–2 working days left (or stuck ≥ SLA without due)
   - **Attention** — 3–5 working days left
   - **Normal** — further out / no pressure
2. Stages gated: R&R, OFS, BFA only (IFC/Released/IFA/OFA out of aging pill).
3. Notifications = ActionItems with dedupe keys (like smart triggers). Alerts
   Center Refresh stays reload-only. Never toast fake alert generation.
4. Out of scope: Slice 8 fabReleaseGate unify; Slice 9 dashboard SoT.

## Tasks

- [ ] Claim + plan
- [ ] `submittalRiskAging.ts` + unit tests
- [ ] Process Board risk pill + summary critical count
- [ ] Submittal detail risk chip
- [ ] Piece Impact aging exposure flag
- [ ] Critical aging ActionItem ensure + tests
- [ ] Verify + commit + PR
