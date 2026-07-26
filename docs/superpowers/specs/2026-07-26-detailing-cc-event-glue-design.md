# Detailing Control Center — Event Glue (Create/Link + Status Sync)

**Date:** 2026-07-26  
**Status:** Draft — awaiting owner review  
**Area:** Detailing Control Center / Submittals / Drawings linking  
**Approach:** Event glue (Approach 1) — thin automations on create, revision upload, and status change  
**Related:** `docs/detailing-control-center-design.md`, `docs/architecture/drawing-workflow-dual-source.md`, `src/lib/submittalActionEngine.ts`, `src/lib/submittalStageMapping.ts`

---

## 1. Problem

Detailing Control Center still requires too much manual bookkeeping on two linked paths:

**B — Create submittal + link drawing sets**
- Sets exist, but create still means hunting / re-picking sets.
- Submittals get created without `drawing_set_ids` → package stage never updates.
- Revisions / new uploads do not stay attached to the open submittal → re-link every cycle.

**C — Stage sync after review**
- Updating submittal status (Approved / R&R / Revise / …) still leaves people fixing drawing/package stage separately.
- Ball-in-court, key dates, and round logging do not reliably move with the status change.

### Owner decisions (brainstorm)

| Topic | Decision |
|---|---|
| Automation aggressiveness | **Mixed:** hard write-through for derived package/workflow stage; **suggest + confirm** for BIC / dates / round |
| New revision on a set with an open linked submittal | **Prompt** with one-click confirm (not silent auto-attach, not queue-only) |
| Scope this pass | Approach 1 only — no “Submit package” command, no drafting-state automation, no required per-sheet response matrix |

---

## 2. Goals & non-goals

### Goals

1. Creating a submittal **from a set/package context** always seeds `drawing_set_ids` (no empty-link default from that entry point).
2. New revision/upload on a set with open linked submittal(s) → one-click **Attach / Not now** confirm.
3. On submittal status change → **hard write-through** of derived package/workflow stage. SoT remains `submittals.status` + `ball_in_court` via `submittalStatusToStage` / package coalescing. Never write `"R&R"` to `drawings.stage`.
4. Same status change → **suggest + confirm** strip for BIC / key dates / round fields (Apply / Edit / Dismiss). No silent overwrite of those fields.
5. Unlinked open work is visible (chip/banner + deep link) so “forgot to attach” is rare — without a full action-rail product.

### Non-goals

- No new **Submit package** command (Approach 2) — deferred follow-up.
- No mandatory per-sheet response matrix (package-level verdicts remain the daily path).
- No silent auto-attach; no auto-lock on approval.
- No drafting-state automation (`detailing_state` Not Started → In Progress → Ready) in this slice.
- No Approach 3 readiness-blocker rail as the primary UX.

---

## 3. Architecture & ownership

### Source of truth (unchanged)

| Concern | SoT |
|---|---|
| Workflow / package stage for boards, KPIs, gates | `submittals.status` + `ball_in_court` → `submittalStatusToStage` / package coalescing |
| Set ↔ submittal link | `submittals.drawing_set_ids[]` |
| Sheet stage | `drawings.stage` — recovery/legacy when no **open** governing submittal (dual-source rules; closed-set sync per PR #152) |
| Suggested next BIC / status steps | `submittalActionEngine` (reuse; do not fork a second transition table) |

### Three event paths

| Event | Immediate write | Confirm / suggest |
|---|---|---|
| **Create submittal** from set, hub package row, or Submittals “new” with set context | Insert with `drawing_set_ids` seeded from context | User may uncheck extras before save; **save disabled until ≥1 set** when opened from set context |
| **Upload / new revision** on set S | File/rev lands as today | If S has open linked submittal(s) → attach confirm modal; if none → optional “Create & link” CTA only (no auto-create) |
| **Status change** (inline, action engine, advance/round path) | Status (+ existing verdict → round log behavior); **hard refresh derived package stage** for linked sets | Post-change strip: suggested BIC, dates (`submitted` / `returned` / `approved` as applicable), round fields — Apply / Edit / Dismiss |

### Link hygiene

- Hub / Process readiness: flag sets with in-flight detailing/review work and **zero open linked submittals** (“No open submittal linked”).
- Hint deep-links to create-with-prefill or link-existing picker.
- Manual unlink remains allowed.
- Closed linked submittals: Drawings sheet-stage recovery unchanged.

---

## 4. UX surfaces

### 4.1 Create-with-prefill

**Entry points**
- Detailing CC set/package row → “Create submittal”
- Drawings set header → create
- Submittals “new” when a set id is in route/query/navigation state

**Behavior**
- Linked-drawing-sets picker opens with context set(s) checked.
- From set context: cannot save with empty `drawing_set_ids`.
- Blank create from Submittals list (no set context): linking stays optional (unchanged).

### 4.2 Revision attach confirm

After successful upload/rev on set S:

- **One** open linked submittal → modal: “Attach this revision to **SUB-### — Title**?” → **Attach** / **Not now**
- **Several** open linked submittals → radio list → Attach selected / Not now
- **None** → no attach modal; optional “Create & link” CTA only

**Attach semantics**
- Ensure set id is present in `drawing_set_ids` (idempotent).
- If the set was unlinked, Attach re-adds it.
- If the submittal is voided/closed between prompt and confirm → error toast, refresh links, no silent write.

Match existing Submittals/upload modal patterns (no new `<form>`; no Radix Dialog unless that surface already uses it).

### 4.3 Post-status suggest strip

- Surfaces on Submittals detail (and hub submittal panel if status can change there) **after** a successful status mutation.
- Shows engine-suggested BIC + applicable date fields + round logging when the advance path would.
- Actions: **Apply suggested** (primary), **Edit** (inline adjust then apply), **Dismiss**.
- Derived package/workflow stage updates from status **immediately**, without waiting for Apply.
- Strip clears on navigate away, Apply, or Dismiss — not a persistent nag queue.

### 4.4 Unlinked hint

- Compact chip/banner on package/set in Process/Hub when work-in-flight and `open linked submittals = 0`.
- CTAs: “Create submittal” (prefill) or “Link existing”.

---

## 5. Data rules (explicit)

1. **Stage hard path:** status mutation success ⇒ consumers recompute derived stage from SoT. Do not require a second manual drawings-stage edit for linked open sets. Do not write display-only `"R&R"` into `drawings.stage`.
2. **BIC / dates / round soft path:** suggestions come from `submittalActionEngine` (+ existing date conventions on verdict transitions). Writes happen only on Apply (or Edit→Apply). Dismiss leaves current BIC/dates untouched.
3. **Round logging:** keep existing audited path (`addSubmittalRound` / advance on verdict). Suggest strip may offer to complete missing round fields; it must not bypass the audited insert path.
4. **Multi-set submittals:** package coalescing rules unchanged. Attach prompt is scoped to the uploaded set.
5. **Permissions:** create / attach / status / Apply use existing `can(...)` gates. No service-role bypass in app code.
6. **Concurrency:** last write wins on `drawing_set_ids` and BIC; no new row locking.

---

## 6. Implementation sketch (for planning; not committed code)

Likely touch points (plan will pin exact files):

- Create prefill: Submittals create modal + navigation state from hub/Drawings set actions.
- Attach candidates helper: pure function  
  `openLinkedSubmittalsForSet(setId, submittals) → Submittal[]`  
  (open = not terminal/void/deleted; linked via `drawing_set_ids`).
- Upload success hook in drawing upload / revision flow → attach modal.
- Status success path in `Submittals.tsx` / shared mutation helper → open suggest strip fed by `submittalActionEngine`.
- Unlinked hint: hub Process/overview package row derive helper + tests.
- Docs: short pointer in `drawing-workflow-dual-source.md` and `detailing-control-center-design.md`.

Prefer pure helpers + unit tests; keep UI thin.

---

## 7. Errors & edge cases

| Case | Behavior |
|---|---|
| Attach target closed/voided mid-flight | Toast error; refresh; no write |
| Status mutation fails | No suggest strip; existing error toast |
| Apply suggestions partially fails | Toast what failed; strip remains with remaining fields |
| Multiple open submittals for set | User picks one in attach modal |
| User dismisses attach | No link change; unlinked hint may still show if applicable |
| Free-form create (no set context) | Linking optional; no forced set |

---

## 8. Tests

| Case | Expect |
|---|---|
| Prefill from set context | Create payload includes context `drawing_set_ids`; save blocked if emptied |
| Blank create | No forced set |
| Attach candidates 0 / 1 / N | Correct modal branch / no modal |
| Status → stage hard path | Derived package stage updates without Apply; `"R&R"` never written to `drawings.stage` |
| Suggest strip Apply | Payload matches engine suggestions |
| Suggest strip Dismiss | BIC/dates unchanged |
| Unlinked hint | True only when in-flight work + zero open links |

---

## 9. Rollout

- Single additive slice; no feature flag required (confirms are opt-in; stage hard path aligns with existing SoT).
- Ship behind normal CI (lint, typecheck gates, vitest, build).
- Follow-up candidates (out of scope): Approach 2 “Submit package”; drafting-state automation; optional stronger readiness blockers.

---

## 10. Success criteria

- Creating from a set almost never produces an unlinked submittal.
- Revision upload almost never leaves the set orphaned from its open submittal without an explicit “Not now”.
- After a status change, Detailing CC / Process boards reflect the new derived stage without a second Drawings pass.
- BIC/dates/round still require one confirmation (Apply) so operators stay in control of commercial fields.
