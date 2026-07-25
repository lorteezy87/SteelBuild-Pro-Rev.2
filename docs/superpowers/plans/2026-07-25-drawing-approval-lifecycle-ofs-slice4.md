# Drawing Approval Lifecycle — Slice 4: OFS Workflow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make OFS (Out for Scrub) a mandatory post-approval scrub step for both
`Approved` and `Approved as Noted`, gate OFS→IFC behind a completion checklist,
and hard-block OFS→OFA / skip-OFS paths (except audited override).

**Architecture:** OFS remains a **derived** stage (`Approved`/`AAN` + Detailer-class
BIC). No new `submittals.status` value. Checklist evidence lives in
`submittals.metadata.ofs_checklist` (and optional `workflow_substatus`) stamped
at IFC issue time. Comment-disposition rows are Slice 5.

**Tech Stack:** Vite + React 18 + TS, Vitest, additive SQL migration for flag
default + transition graph parity.

## Global Constraints

- Never write `"R&R"` to `drawings.stage`.
- No Radix Dialog / no `<form>` tags.
- CSS variables only; Iron Forge Command tokens.
- App roles remain `owner`/`admin`/`pm`/`field`/`viewer` — no new Detailer role.
- Full suite + lint + build green before commit; Conventional Commits.

## Product decisions locked

1. **Force Approved through OFS** — `submittal_approved_to_scrub` defaults ON;
   action engine defaults `approvedRoutesToScrub: true`. Legacy skip only via
   explicit `false` / flag off.
2. **AAN and Approved** share BFA → OFS → IFC → Released.
3. **OFS label** — “OFS — Out for Scrub”; scrub ≠ resubmittal.
4. **OFS→IFC** requires checklist completion (or audited override reason).
5. **OFS→OFA** blocked (Approved/AAN may not return to Submitted/Under Review
   without override).
6. **Skip OFS** blocked — cannot Released-for-Fab from BFA/OFS; must be at IFC.
7. Comment dispositions table deferred to Slice 5.

## Tasks

- [x] Claim area in `AGENT_CLAIMS.md`
- [x] Default `submittal_approved_to_scrub` ON (migration + engine/UI defaults)
- [x] `src/lib/ofsCompletionGate.ts` + tests (checklist + OFS→OFA + skip-OFS)
- [x] Wire gates into `addSubmittalRound`; tighten `submittalTransitions`
- [x] IFC issue dialog with checklist; wire SubmittalDetail CTA
- [x] Process-board / stage captions: “Out for Scrub”
- [x] Verify lint/test/build; commit; push; update PR #122

## Acceptance criteria

- Approved → OFS → IFC → Released happy path is the default.
- AAN → OFS → IFC happy path unchanged in spirit.
- Cannot skip OFS to IFC/Released without override.
- OFS → OFA blocked without override.
- IFC issue requires checklist (or override reason).
- Surfaces label OFS as Out for Scrub.
