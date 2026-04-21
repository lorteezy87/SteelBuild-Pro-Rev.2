# SteelBuild Pro — Remediation Log
**Date:** 2026-04-20
**Scope:** Phase 2 of baseline audit (`AUDIT_2026-04-20.md`).
**Branch:** `claude/wonderful-williamson-44a718`
**Deploy branch:** `codex/base44-deploy-nick`

---

## 0. Scope decision

During Phase 1 review the user disclosed an incoming **full-app redesign handoff from Claude Design**. Rather than burn effort on cosmetic deficiencies that will be wiped out by a new design system, the user directed option **C**: narrow Phase 2 to carve-ups only, park everything cosmetic pending the redesign, and defer scope-question deficiencies until a direction is chosen.

The remediation work in this log focuses on **structural + behavioral** fixes that survive a redesign: they cut the largest monolithic files into focused components (making per-page restyling a clean single-file job) and fix one cross-page drift pattern. Every cosmetic/token deficiency from the audit is parked with a reason noted.

---

## 1. Deficiencies addressed

| ID | Title | Commit | Status | Notes |
|---|---|---|---|---|
| D01 | Scoped-vs-unscoped queryKey stale cache | `cbd22dac` (audit correction only) | **Closed — false positive** | React Query v5 prefix matching handles all four reported sites. `["wps-all"]` is queried by `ProductionNotes.jsx:66`; `["action-items-all"]` by `Dashboard.jsx:25` + `Reports.jsx:73`. Correction logged in AUDIT document. |
| D13 | Expenses bulk Paid/Voided silent on success | `ff93e452` (no code change) | **Closed — false positive** | `bulkUpdateMut.onSuccess` already calls `toast.success('${n} expense(s) updated')` at the original source. Agent-3 misread the file. Noted in REMEDIATION (this log). |
| D14 | Schedule hardcodes PHASE_ABBREV | pending in batched carve-up commit | **Fixed** | Originally proposed to import from `pages/workPackages/constants.js`, but that's the wrong source — WP uses a 4-phase production pipeline, Schedule uses a 7-phase project lifecycle. Canonical list is `src/utils/phases.js`. `PHASE_ABBREV` moved there and imported by `Schedule.jsx`. Other pages (Gantt, Lookahead) can now share it. |
| D16 | Deliveries.jsx 1404 lines → carve-up | `cbd22dac` | **Shipped** | 1404 → 542 (61%). 10 focused files under `src/pages/deliveries/`: `constants`, `utils`, `subcomponents`, `CommandBar`, `KpiStrip`, `AlertBanner`, `FilterBar`, `LookaheadPanel`, `DeliveryRow`, `TimelineView`, `DetailDrawer`, `BulkActionBar`, `EmptyState`. Deploy merge `6ad557e7`→… on `codex/base44-deploy-nick`. No behavior changes. |
| D17 | Expenses.jsx 1241 lines → carve-up | `ff93e452` | **Shipped** | 1241 → 498 (60%). 8 files under `src/pages/expenses/`: `constants`, `utils`, `charts` (MiniProgressRing, BudgetDonutChart, BurndownSparkline, MonthlyTrendChart, PaymentCircle), `KpiStrip`, `AnalyticsGrid`, `AlertChips`, `FilterBar`, `ExpenseTable`, `BulkActionBar`. No behavior changes. |
| D19 | Documents.jsx 1097 lines → carve-up | pending in batched carve-up commit | **Shipped** | 1097 → 518 (53%). 8 files under `src/pages/documents/`: `constants`, `utils`, `FolderSection`, `Toolbar`, `BatchActionBar`, `ListView`, `EmptyState`, `TransmittalModal`. Bulk download / bulk delete confirm flow preserved. No behavior changes. |

### Commit chain (most recent → oldest)

- `<pending>` — `refactor(docs+schedule): Documents.jsx carve-up + canonical PHASE_ABBREV` (D19 + D14)
- `ff93e452` — `refactor(expenses): carve Expenses.jsx into src/pages/expenses/` (D17)
- `cbd22dac` — `refactor(deliveries): carve Deliveries.jsx into src/pages/deliveries/` (D16 + D01 correction)

---

## 2. Deficiencies deferred

All cosmetic / token-related deficiencies are **parked pending the redesign**. Rationale: if the new design system replaces the token layer, migrating 140 files of hex colors or 80 files of border-radius to the current tokens is wasted work. Once the handoff arrives and the new tokens are defined, these can be swept in the same pass that applies the new aesthetic.

| ID | Title | Parked because |
|---|---|---|
| D02 | Radix Dialog in 10 modals + DeleteDialog | Modals will be restyled during redesign; swap from Radix to fixed-overlay during that pass. |
| D03 | 15 `<form>` tags | Form-modal patterns likely change wholesale during redesign. |
| D04 | 140 files with hardcoded hex colors | Token system may be replaced wholesale. |
| D05 | `crudFeedback` not adopted across 15+ pages | Affects error copy styling and toast placement — redesign may prescribe a different pattern. |
| D06 | Query key chaos (5 entities × 8-9 variants) | Non-visual but de-risked by D01 being a false positive. Can be done alongside redesign or in a separate pass; not urgent. |
| D09 | Border-radius drift (80+ files) | Pure cosmetic. |
| D10 | Orange used decoratively in 6 files | Pure cosmetic. |
| D20 | Hardcoded font-family in 3 files | Pure cosmetic. |
| D22 | `dmsConstants.js` file-type color registry | Redesign may define new filetype token names. |
| D23 | 100 `console.*` calls across 41 files | Low priority hygiene; half are legitimate (services/lib). |
| D24 | Layout.jsx defensive column checks | Needs user decision — migration or removal? Waiting on confirmation. |

### Deficiencies requiring user decision (still open)

| ID | Open question |
|---|---|
| D11 | Submittals module: build, document as DMS-only, or drop? |
| D12 | PMA (Project Management Assistant): does it exist under a different name, or pending build? |
| D21 | Delete unused deps (`moment`, `react-hot-toast`, stale `use-toast.jsx`)? |
| D24 | Ship migration for `is_dismissed` / `dismissed_at` / `is_read` columns, or remove defensive branches? |

### Deficiencies partially addressed

| ID | Title | Status |
|---|---|---|
| D15 | ResourceScheduling.jsx (1327 lines) — "partial carve-up only" | **Not further reduced.** On inspection, ResourceScheduling already has 8 extracted components under `src/pages/resourceScheduling/`. The remaining 1327 lines are drag-handler logic + state management — tightly coupled to react-hello-pangea/dnd lifecycle. Further carve-up would be mechanical (extract `dndHandlers.js`) but without the redesign context, not worth the risk. Parked pending redesign. |
| D18 | Schedule.jsx (902 lines) — carve-up | **Not further reduced; D14 portion fixed.** The `PHASE_ABBREV` drift (part of D14) is fixed by moving the constant to `src/utils/phases.js`. Full carve-up deferred — Schedule.jsx is large but not bloated; each section serves a distinct concern (Gantt, Lookahead, Task list, drawer). Parked pending redesign. |

---

## 3. Corrections to the original audit

The Phase 1 audit agents produced two false positives that I verified during remediation and downgraded in place:

1. **D01 (originally Critical):** downgraded to **not-a-bug**. React Query v5's default `exact: false` prefix matching handles every one of the four reported sites; the "orphan" invalidation keys actually have matching queries on other pages. The noise reflects query-key naming chaos (D06) but is not a correctness bug. Correction note appended to AUDIT section §3.

2. **D13 (originally Medium):** downgraded to **not-a-bug**. Line 383 of pre-carve-up `Expenses.jsx` already calls `toast.success('${n} expense(s) updated')` inside `bulkUpdateMut.onSuccess`. Agent-3 missed it.

3. **D14 (originally Medium) — partial correction:** the finding was correctly flagged but misdirected its fix. Schedule's `PHASE_ABBREV` doesn't belong in `workPackages/constants.js` because those are different phase taxonomies (7-phase lifecycle vs. 4-phase production pipeline). The correct home is `src/utils/phases.js` — which is where `PHASES` for Schedule already lives. Fixed accordingly.

**Audit quality lesson:** Explore agents are fast but can misread React-Query semantics and miss adjacent toast calls. Any finding of class "invalidation orphan" or "missing success toast" should be verified with a direct `Grep` before remediation starts. Worth building into the audit playbook.

---

## 4. Net effect on codebase

**Line counts (before → after):**
- Deliveries.jsx:  1404 → 542  (-862, -61%)
- Expenses.jsx:    1241 → 498  (-743, -60%)
- Documents.jsx:   1097 → 518  (-579, -53%)
- **Total page-shell reduction:** 3742 → 1558 lines (**-2184 lines, -58%**)

**Feature folders created:**
- `src/pages/deliveries/` — 13 files, 1228 lines
- `src/pages/expenses/`   — 9 files, 1041 lines
- `src/pages/documents/`  — 8 files, 1090 lines
- **Total:** 30 new focused component files covering what used to be 3 monoliths.

**Other impact:**
- `src/utils/phases.js` gained `PHASE_ABBREV` export; `Schedule.jsx` now consumes it.
- `AUDIT_2026-04-20.md` in-place correction on D01.
- `REMEDIATION_2026-04-20.md` (this file).

**No behavior changes, no schema changes, no migrations added.**

---

## 5. Redesign handoff preparation

When the Claude Design handoff arrives, brief it with these non-negotiables. Copy/paste ready:

> **SteelBuild Pro — non-negotiable architectural rules for the new design.**
>
> 1. **No `<form>` tags.** Use `<div>` + onClick save handlers; the app has 15 remaining `<form>` tags from prior iterations that will also be removed during the redesign pass.
> 2. **No Radix Dialog** (`@radix-ui/react-dialog`). Modals are plain `position: fixed; inset: 0` overlays with a scrollable body and `flex-shrink: 0` header/footer. The existing `src/components/shared/DeleteDialog.jsx` currently violates this (uses Radix `AlertDialog`) and should also be rebuilt during the redesign.
> 3. **Colors via CSS variables only.** The current token registry is in `src/styles/tokens.css` with 196+ tokens. Redefine values, keep names. One exception: `src/pages/workPackages/constants.js` exports `PHASE_HEX` as raw hex strings explicitly for runtime `rgba()` shadow/glow math — that's documented and should stay.
> 4. **Typography:** IBM Plex Mono for numbers/codes (via `var(--font-mono)`), Space Grotesk for headings (via `var(--font-display)`), body in `var(--font-body)`.
> 5. **Domain semantics preserved.** The steel PM workflow has specific ordered pipelines that carry meaning through color:
>    - Drawing stages: Not Started → OFA → BFA → OFS → BFS → FFF → Released (stage color = workflow position).
>    - WP phases: Detailing → Fabrication → Delivery → Erection (phase color tied to `--phase-*` tokens).
>    - Schedule phases: Pre-Construction → Detailing → Procurement → Fabrication → Delivery → Installation → Closeout (different lifecycle scope).
>    - Ball-in-Court: Contractor, GC, Engineer, Architect, Owner (each has a semantic color).
>    - Orange is reserved for critical / pending-action states (overdue RFIs, high-value pending COs, Revise & Resubmit). Green dominates approved states.
> 6. **Density requirements.** Steel PMs need to scan large tables fast. 2-level detail in rows, monospace numerics, status chips small enough to fit multiple per row.
> 7. **Recommended pilot order:**
>    - Tier 1 (low density): Dashboard, Landing, Settings, Auth.
>    - Tier 2 (medium density): RFIs, ChangeOrders, Contacts, WorkPackages lists.
>    - Tier 3 (high density): Gantt, ResourceScheduling, Financials, Drawings.
>    - Tier 4 (power tools): ModelViewer, import flows, PMA-style briefings.

---

## 6. Recommended next actions (post-redesign decision)

Once the handoff arrives:
1. **Pilot one page** with the new design before committing to the rollout.
2. **During the pilot**, sweep the deferred cosmetic deficiencies (D02, D03, D04, D09, D10, D20, D22) as part of that page's restyle — they're cheaper to fix in-flow than separately.
3. **After rollout**, tackle D05 (`crudFeedback` adoption) and D06 (queryKey registry) as independent infrastructure passes. Neither visual; both preservation work.
4. **Answer** D11 (Submittals), D12 (PMA), D21 (dead deps), D24 (defensive columns) during that same window.
5. **Run a second audit** after the redesign ships and compare against `AUDIT_2026-04-20.md` to see net improvement vs. new drift.

---

**End of remediation log.**
