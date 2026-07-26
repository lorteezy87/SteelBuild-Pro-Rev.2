# Detailing CC Event Glue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Detailing CC manual create/link and post-status bookkeeping via event glue: prefill links on create-from-set, revision attach confirm, hard derived-stage sync on status change, and suggest+confirm for BIC/dates.

**Architecture:** Pure helpers in `src/lib/submittalLinkGlue.ts` own open-link queries, suggest payloads, and unlinked hints. UI stays thin: Submittals consumes `targetSetId` query params; revision upload parents show an attach confirm; status mutation success opens a suggest strip. Workflow SoT remains `submittals.status` + `ball_in_court` (no `"R&R"` writes to `drawings.stage`).

**Tech Stack:** Vite/React 18/TypeScript, TanStack Query, Vitest, existing `submittalActionEngine` / `submittalStageMapping`, Sonner toasts, existing Submittals Dialog patterns.

## Global Constraints

- Never write `"R&R"` to `drawings.stage`.
- Hard write-through = derived package/workflow stage from SoT + cache invalidate (no sheet-stage mutation for open linked sets).
- BIC / dates / round soft path = suggest + Apply / Edit / Dismiss only.
- Revision attach = confirm modal, never silent auto-attach.
- Create-from-set context: save blocked if `drawing_set_ids` empty.
- Open-for-link definition: not deleted and status ∉ `TERMINAL_STATUSES` (`Approved`, `Approved as Noted`, `Released for Fabrication`, `Void`) — aligned with `buildSubmittalsBySetId`.
- New code `.ts`/`.tsx` only; no new `<form>`; match existing modals.
- Reuse `nextSubmittalAction` — do not fork a second transition table.

## File map

| File | Responsibility |
|---|---|
| Create: `src/lib/submittalLinkGlue.ts` | Pure: open linked subs, suggest patch, unlinked hint |
| Create: `src/lib/__tests__/submittalLinkGlue.test.ts` | Unit tests for helpers |
| Create: `src/components/submittals/AttachRevisionToSubmittalModal.tsx` | Attach confirm UI |
| Create: `src/pages/submittals/StatusSuggestStrip.tsx` | Apply/Edit/Dismiss strip |
| Modify: `src/pages/Submittals.tsx` | Consume `targetSetId`; wire suggest strip after status success |
| Modify: `src/pages/submittals/SubmittalFormModal.tsx` | `requireLinkedSet` save gate |
| Modify: `src/pages/Drawings.jsx` | Revision `onComplete` → attach modal; ensure create nav params |
| Modify: hub register / Process surfaces | Unlinked hint chip + create CTA |
| Modify: `docs/architecture/drawing-workflow-dual-source.md` | Short event-glue pointer |
| Modify: `docs/detailing-control-center-design.md` | Pointer to event-glue spec |

---

### Task 1: Pure link/suggest helpers

**Files:**
- Create: `src/lib/submittalLinkGlue.ts`
- Test: `src/lib/__tests__/submittalLinkGlue.test.ts`

**Interfaces:**
- Produces:
  - `isOpenForLink(submittal): boolean`
  - `openLinkedSubmittalsForSet(setId, submittals): T[]`
  - `buildStatusSuggestPatch(prev, nextStatus, opts?): { ball_in_court, submitted_date?, returned_date?, approved_date? } | null`
  - `needsUnlinkedSubmittalHint({ hasInFlightWork, openLinkedCount }): boolean`

- [ ] **Step 1:** Write failing tests for 0/1/N open links, terminal exclusion, deleted skip, suggest patch BIC from engine, unlinked hint truth table.
- [ ] **Step 2:** Run `npx vitest run src/lib/__tests__/submittalLinkGlue.test.ts` — expect FAIL (module missing).
- [ ] **Step 3:** Implement helpers (open = `TERMINAL_STATUSES` + `!is_deleted`; suggest uses `nextSubmittalAction` on `{ status: nextStatus, ball_in_court: prev.ball_in_court }` only when BIC would change or dates missing for sent/verdict transitions).
- [ ] **Step 4:** Re-run tests — PASS.
- [ ] **Step 5:** Commit `feat: add submittal link glue helpers`.

---

### Task 2: Create-with-prefill

**Files:**
- Modify: `src/pages/Submittals.tsx`
- Modify: `src/pages/submittals/SubmittalFormModal.tsx`
- Test: extend `src/lib/__tests__/submittalLinkGlue.test.ts` or small derive test for prefill seed helper `buildCreateInitialFromSet(setId, extras?)`

**Interfaces:**
- Consumes: URL `targetSetId`, optional `prefilledStatus`
- Produces: create modal opens with `drawing_set_ids: [targetSetId]`, `requireLinkedSet=true`

- [ ] **Step 1:** Add `buildCreateInitialFromSet` + test.
- [ ] **Step 2:** On Submittals mount / searchParams change: if `targetSetId`, open create with seeded initial; clear params after consume (replace navigate).
- [ ] **Step 3:** `SubmittalFormModal`: prop `requireLinkedSet?: boolean` — block submit with toast if empty ids.
- [ ] **Step 4:** Verify Drawings already navigates with `targetSetId` (producer exists). Add hub Process/Control “Create submittal” CTA → `/Submittals?targetSetId=…` if missing.
- [ ] **Step 5:** Commit `feat: prefill drawing_set_ids on create-from-set`.

---

### Task 3: Revision attach confirm

**Files:**
- Create: `src/components/submittals/AttachRevisionToSubmittalModal.tsx`
- Modify: `src/pages/Drawings.jsx` (and hub revision `onComplete` path)
- Modify: `src/components/drawings/RevisionUploadModal.jsx` — pass `{ setId, setName, revisionLabel }` via `onComplete` when possible without breaking callers

**Interfaces:**
- Consumes: `openLinkedSubmittalsForSet`
- Produces: Attach writes `drawing_set_ids` union via `entities.Submittal.update`

- [ ] **Step 1:** Modal: 1 candidate → confirm copy; N → radio; Attach / Not now.
- [ ] **Step 2:** Wire Drawings + hub after revision success when `setId` known and candidates.length > 0.
- [ ] **Step 3:** Closed mid-flight → toast error, refresh.
- [ ] **Step 4:** Commit `feat: confirm attach revision to open submittal`.

---

### Task 4: Status suggest strip + stage hard path

**Files:**
- Create: `src/pages/submittals/StatusSuggestStrip.tsx`
- Modify: `src/pages/Submittals.tsx` (`advanceMut` / status `updateMut` onSuccess)

**Interfaces:**
- Consumes: `buildStatusSuggestPatch`, existing invalidate
- Produces: strip state; Apply → `updateMut` with suggested fields only

- [ ] **Step 1:** After successful status-changing mutation, compute suggest patch; if non-null and differs from current, show strip.
- [ ] **Step 2:** Strip UI: Apply / Edit (inline BIC + dates) / Dismiss.
- [ ] **Step 3:** Ensure invalidate includes drawing/submittal so hub derived stage refreshes (hard path). Do **not** write sheet stage.
- [ ] **Step 4:** Commit `feat: status suggest strip for BIC and dates`.

---

### Task 5: Unlinked hint in hub

**Files:**
- Modify: `src/pages/drawingSubmittalHub/format.ts` (or sibling derive)
- Modify: Process/Control row render components that show package cards
- Test: format/processBoard tests

**Interfaces:**
- Consumes: `needsUnlinkedSubmittalHint`, open-link counts from `openLinkedSubmittalsForSet` / `buildSubmittalsBySetId.open`

- [ ] **Step 1:** Flag package rows with in-flight work + openLinkedCount === 0.
- [ ] **Step 2:** Chip + “Create submittal” → `/Submittals?targetSetId=` and “Link existing” if a picker already exists; else create-only CTA is enough.
- [ ] **Step 3:** Commit `feat: unlinked submittal hint on detailing packages`.

---

### Task 6: Docs + verify

**Files:**
- Modify: `docs/architecture/drawing-workflow-dual-source.md`
- Modify: `docs/detailing-control-center-design.md`
- Update: spec status → Approved / Implementing

- [ ] **Step 1:** Short pointers to event-glue behavior.
- [ ] **Step 2:** `npm run lint`, targeted vitest, `npm run check:no-new-js`.
- [ ] **Step 3:** Commit + push; update PR #154 body for implementation.

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Create-from-set seeds `drawing_set_ids` | 2 |
| Save disabled/blocked empty link from set context | 2 |
| Revision attach confirm 0/1/N | 1, 3 |
| Status → hard derived stage (no R&R sheet write) | 4 |
| BIC/dates suggest + confirm | 1, 4 |
| Unlinked hint | 1, 5 |
| Docs pointer | 6 |
