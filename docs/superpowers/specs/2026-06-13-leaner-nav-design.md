# Leaner navigation — consolidation design (2026-06-13)

## Goal

Make the app leaner by consolidating the navigation **without removing any
feature**. Driven by Nick's module diagram (red = combine/delete) + the §2.5
strategic focus. Scope chosen: **"consolidate, keep features"** — fold
overlapping pages into hub-tabs, regroup for a cleaner mental model, delete only
true dead duplicates. Every capability stays reachable; the change is almost
entirely nav-layer config and is fully reversible.

## Key facts that make this low-risk

- Every hub (`ScheduleHub`, `FieldHub`, `CostHub`, `RiskHub`, `ResourceHub`,
  `ReportsHub`, `PortfolioHub`, `DrawingSubmittalHub`) is a **thin tab-shell**:
  each tab `lazyWithRetry(() => import("@/pages/<Page>"))` renders the existing
  page **unchanged**, and every page **stays independently routable**.
- So consolidation = trimming `SIDEBAR_GROUPS` / `NAV_GROUPS` in
  `src/config/moduleRegistry.js` + a couple of new thin hubs. **No page files
  are deleted.** Reachability is preserved (hub tab + direct route).
- The route/nav validators (`validateNavConfig`, `validateRoutes`) must stay
  green: every nav page registered, every page reachable.

## Current hub → tab map (already consolidated, routable)

| Hub (sidebar label) | Absorbed tabs |
|---|---|
| Portfolio Overview (`PortfolioHub`) | AIInsights, ExecutiveView |
| Detailing Control Center (`DrawingSubmittalHub`) | Drawings, Submittals, Doc Control, Revision Compare (+ 3D model-mapping data already wired) |
| Schedule (`ScheduleHub`) | Schedule, Look-Ahead, Gantt, Project Calendar |
| Risk (`RiskHub`) | Margin Risk, Constraints |
| Resources (`ResourceHub`) | Resource Register, Crew Scheduling |
| Budget Control (`CostHub`) | Budget Detail (Financials), Cost Dashboard |
| Field Hub (`FieldHub`) | Field Today, Field, Inspections, Safety, Punchlist, QC |
| Reports (`ReportsHub`) | Reports, Job Status, Decision Log, Activity |

## Target sidebar (10 groups, ~31 items — down from ~42)

1. **OVERVIEW** (3) — Dashboard · Command Center · Portfolio Overview
2. **PROJECTS** (1) — **Projects** *(new `ProjectsHub`: Projects / Scope & Exclusions / Contacts / Members as tabs)*
3. **DETAILING** (1) — **Detailing Control Center** *(Drawing Viewer folds in; "3D Model" tab reserved for the viewer rebuild)*
4. **PROJECT MANAGEMENT** (3) — Schedule · RFIs · Action Items
5. **PRODUCTION** (8) — Work Packages · Fab Release · Production Status · Procurement · Budget Hours · Risk · Resources · Deliveries
6. **FIELD** (2) — **Field Today** (kept top-level) · **Field Hub** *(extended with Daily Logs / Photos / LEMs tabs)*
7. **COST** (6) — Budget Control · Change Orders · SOV · Pay Applications · Backcharge Defense · Expenses
8. **DOCUMENTS & REPORTS** (2) — Documents · Reports
9. **ADMINISTRATION** (4) — Team · Billing · Vendors · Settings
10. **TOOLS** (1) — **Calculators** *(new `CalculatorsHub`: the 5 calculators as tabs)*

### Decisions applied

- **Cost unified:** Change Orders / Pay Applications / Backcharge move out of
  Project Management into one **COST** group with Budget Control / SOV /
  Expenses. Project Management becomes Schedule + RFIs + Action Items.
- **Field Today stays top-level** (phone-first capture lane) *and* remains the
  default Field Hub tab.

## Work required

1. **`moduleRegistry.js`** — rewrite `SIDEBAR_GROUPS` to the target; mirror in
   `NAV_GROUPS` (modules dropdown) and keep `PRIMARY_TABS` mapping every page so
   route→tab highlighting + reachability hold.
2. **`ProjectsHub.jsx`** (new) — thin tab-shell (copy `ScheduleHub` pattern,
   `?proj_tab=`): Projects (default) / Scope & Exclusions / Contacts / Members.
   Register route; point the PROJECTS sidebar entry at it.
3. **`CalculatorsHub.jsx`** (new) — thin tab-shell (`?calc_tab=`) wrapping the 5
   calculators. Register route; point the TOOLS entry at it.
4. **Extend `FieldHub`** — add Daily Logs / Photos / LEMs tabs (alongside the
   existing Field / Inspections / Safety / Punchlist / QC).
5. **Detailing Control Center** — drop Drawing Viewer from the sidebar (opens
   contextually; route kept). Reserve a "3D Model" tab slot (lands with the
   viewer rebuild — see Out of scope).

## Out of scope (separate follow-ons)

- **3D viewer rebuild** — its home is confirmed (a Detailing Control Center
  tab, next to the model-mapping data already there), but the `@thatopen` stack
  was removed earlier, so it needs a viewer lib + model source. Tracked
  separately; the "3D Model" tab ships dark until then.
- **Feature deletion** — none, by the chosen scope.

## Validation

- `validateRoutes` / `validateNavConfig` return no drift (dev console + the nav
  config tests).
- `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm test`, and
  `vite build` all green.
- Manual: every group expands; each hub's new tabs load; no orphaned sidebar
  entry; mobile drawer + modules dropdown match.

## Reversibility

Pure nav-config + additive thin hubs; no page deleted. Reverting is a
`moduleRegistry.js` git revert + removing the two new hub files.
