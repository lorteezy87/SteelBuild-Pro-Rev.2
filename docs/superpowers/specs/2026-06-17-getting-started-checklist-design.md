# Getting Started workflow checklist — design

**Date:** 2026-06-17
**Status:** Approved (brainstorm) → ready for implementation plan

## Goal

Teach new users the killer workflow — **drawings → submittals → RFIs → fab
release** — with a smart, data-driven "Getting Started" checklist that tracks a
project's real progress through the four stages and links the user to each one.
This is a *workflow walkthrough*, distinct from the existing data-setup
onboarding (`OrgOnboarding.jsx` first-run org wizard; `Onboarding.jsx`
project-create/import/seed; `Tutorial.jsx`). Those are left untouched.

## Behavior

- A **dismissible card at the top of the project Dashboard** (`src/pages/Dashboard.jsx`).
- Shown for any active project that has **not** finished all four steps and has
  **not** been dismissed.
- The first incomplete step is highlighted as the **current** step. Completed
  steps show a ✓ and collapse to a single line. `todo` steps are muted.
- When all four steps are complete, the card shows a brief "Workflow complete"
  confirmation, then hides for that project (and does not return).
- A **Dismiss** link hides the card early (per project).

## The four steps

Each step renders: an icon, a title, a one-line *why* (the teaching element), a
deep-link CTA, and a data-driven status.

| # | Step | Title / why | Complete when (signal) | CTA → |
|---|------|-------------|------------------------|-------|
| 1 | Drawings | **Upload drawings** — the documents the job is built from | project has ≥1 active drawing set / sheet | Drawings (upload) |
| 2 | Submittals | **Create a submittal** — submittals own the approval workflow; drawings are just the documents | ≥1 active submittal for the project | Submittals / hub |
| 3 | RFIs | **Raise RFIs** — questions to the EOR that can gate fabrication | ≥1 RFI **OR** the per-project "No RFIs needed" skip | RFIs |
| 4 | Fab release | **Release for fabrication** — the gate that checks approval, RFIs, rejected sheets & revision conflicts | a `fab_release_log` row for the project **OR** a submittal at status "Released for Fabrication" | Fab Release |

Steps are presented and completed **in order**, but completion of any step is
independent (derived from data); the "current" highlight is simply the first
step whose status is not `done`.

## Architecture

Follows the codebase's pure-logic-+-presentational-component pattern.

### `src/lib/gettingStarted.ts` (pure, unit-tested)

```ts
export type StepStatus = "done" | "current" | "todo";
export interface GettingStartedStep {
  key: "drawings" | "submittals" | "rfis" | "fab";
  status: StepStatus;
}
export interface GettingStartedSignals {
  hasDrawings: boolean;
  hasSubmittal: boolean;
  hasRfi: boolean;
  rfiSkipped: boolean;
  hasFabRelease: boolean;
}
export interface GettingStartedState {
  steps: GettingStartedStep[]; // always 4, in workflow order
  allComplete: boolean;
}
export function computeGettingStartedSteps(signals: GettingStartedSignals): GettingStartedState;
```

Rules:
- step done-ness: drawings = `hasDrawings`; submittals = `hasSubmittal`;
  rfis = `hasRfi || rfiSkipped`; fab = `hasFabRelease`.
- `current` = the first step (in order) that is not done; all later not-done
  steps are `todo`.
- `allComplete` = all four done.

No React, no Supabase — just signals → state.

### `src/hooks/useGettingStarted.ts`

- Resolves the five signals for the active project:
  - `hasDrawings` / `hasSubmittal` / `hasRfi` / `hasFabRelease` via cheap
    `count`-only Supabase queries (`{ count: "exact", head: true }`) filtered by
    `project_id` and `is_deleted = false` (where applicable), or reuses data the
    Dashboard already loads when available.
  - `hasFabRelease` = a `fab_release_log` row for the project OR any submittal
    with status `"Released for Fabrication"` (covers projects released before the
    server-side gate existed).
  - `rfiSkipped` and `dismissed` from localStorage.
- Returns `{ state, dismissed, isLoading, skipRfi(), dismiss() }`.

### `src/components/dashboard/GettingStartedChecklist.tsx`

- Presentational over `useGettingStarted`. Renders the four steps, the
  current-step emphasis, CTAs (navigate + set active project context), the
  "No RFIs needed" skip (step 3 only), and the Dismiss link.
- Rendered at the top of `Dashboard.jsx`, gated on
  `activeProject && !dismissed && !state.allComplete` (plus a loading skeleton).

## Persistence

`dismissed` and `rfiSkipped` are **per-project localStorage** flags
(`sbp:getting-started:<projectId>:dismissed`,
`sbp:getting-started:<projectId>:rfi-skipped`) — consistent with existing UI-state
keys (e.g. `sbp:viewer-colormode`). No migration, no RLS surface. Steps 1/2/4 are
always derived from live data, so they stay correct across devices automatically.

## Deep links / CTAs

Each CTA navigates to the relevant route with the active project in context
(the Dashboard is already project-scoped). Targets: Drawings, Submittals (or the
Drawing & Submittal Hub), RFIs, and the Fab Release page/gate. Exact route
constants resolved during implementation against `src/config/routes.js`.

## Edge cases

- No active project → render nothing.
- Loading signals → a single skeleton row (no layout jump).
- A project that already satisfies all four (existing data) → card never shows.
- Dismiss is reversible only by clearing localStorage — acceptable for onboarding.

## Testing

- **Unit (node):** `computeGettingStartedSteps` — every step's done/current/todo
  transition, the RFI skip path, partial progress (current points at the right
  step), and `allComplete`.
- **Component (jsdom):** renders the current-step highlight, wires the CTAs,
  fires `skipRfi`/`dismiss`, and renders nothing when complete or dismissed.

## Scope guardrails (YAGNI — explicitly out)

- No spotlight/coach-mark tour.
- No backend table or migration (localStorage only for UI flags).
- No cross-project "first-time-only" logic — it's per project.
- No changes to `Onboarding.jsx` / `OrgOnboarding.jsx` / `Tutorial.jsx`.
