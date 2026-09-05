# Work Package Control Center — audit, 2026-09-05

Scope: `/WorkPackages` (page container, control-center shell, Flow / Board /
Register views, exception rail, decision panels, KPI strip), the three live
modals (create/edit, bulk add, detail drawer), the shared work-package
libraries, the database functions and policies behind packages, and every
route into or out of the page. Ground truth was the DB schema in
`supabase/migrations/20260101000010_baseline_schema.sql` (+ later migrations),
`src/types/supabase.ts`, and a census of production
(`kjrwqagyeswwoxpjkcko`) on 2026-09-05. Every finding below was verified by
reading the cited code; nothing is inferred from names.

Production census that sizes the findings (81 live packages, max 20 per
project, max 148 drawings per project):

| Signal | Count |
|---|---|
| Packages with **no tonnage** | 36 of 81 |
| Packages with **no scheduled end date** | 69 of 81 |
| Packages marked **Complete with progress < 100** | 6 |
| Packages past Detailing with **no drawings linked** | 14 |
| Packages with an **active fab release** | 14 (every one an *exception* release) |
| Packages with pieces assigned | 30 (1,465 pieces) |

Severity: **P1** = wrong numbers or blocked/misleading actions a PM hits
weekly; **P2** = real defect, narrower blast radius; **P3** = hygiene.

---

## 1. Logic and reasoning

### P1 — Three sources of truth for "where is this package"
`work_packages.phase` (typed by hand, no CHECK constraint), `status` (typed
by hand *or* overwritten by the piece rollup), and `percent_complete`
(overwritten by the rollup) are independent, and the center derives every
KPI, panel and flag from all three as if they agreed.

- `src/pages/workPackages/analytics.js:120-125` — `complete` is
  `status ∈ closed ∨ progress ≥ 100`; `readyForShip` (`:259-263`) is
  `phase = Fabrication ∧ progress ≥ 90`; `fieldReady` (`:264-268`) is
  `phase = Delivery ∧ progress ≥ 90 ∧ readiness ≥ 75`.
- Production has packages in phase **Erection, status Not Started, 0 of 183
  pieces fabricated** (WP 32) and **status Complete, progress 0, 0 of 270
  fabricated** (WP 35). Both are counted as field-phase work; neither shows
  in "Ready to Ship" because phase was hand-set past Fabrication.
- Nothing advances `phase`. "Ready for Fab" (`:248-252`) requires
  `phase = Detailing`; once a PM edits the phase the package leaves every
  readiness bucket regardless of drawings or pieces.

**Fix.** Derive phase from canonical state when piece control is on
(`released → Fabrication`, `all fabricated → Delivery`, `any delivered →
Erection`, `all erected → Complete`) in `refresh_work_package_progress`, and
make the UI phase field read-only for piece-driven packages, exactly as it
already does for status and percent. Until then, show the three fields side
by side in the Register so the contradiction is visible instead of silently
mixed.

### P1 — Manual status is silently reverted by the piece rollup
- Bulk "SET COMPLETE" / "SET IN PROGRESS" (`src/pages/WorkPackages.tsx:203-221,
  372-383`) write `status` directly with no piece-control check. On pilot /
  live projects the next piece event rewrites it
  (`refresh_work_package_progress`, `20260801013000:60-62`, runs for every
  mode except `off`).
- The client's "piece-driven" test only covers `pilot`/`live`
  (`src/lib/pieceControl/wpProgressMapping.ts:77-83`) while the SQL also
  writes through in `shadow`, so in shadow mode the edit form lets a PM type a
  status the DB will erase.
- With zero leaf pieces the rollup unconditionally sets `status = 'Not
  Started'` (`20260801013000:83-87`), so unassigning the last piece erases a
  hand-set On Hold or Complete.
- Six production packages are Complete with progress under 100 for exactly
  this reason.

**Fix.** Align `isPieceDrivenWorkPackageProgress` with the SQL (include
`shadow` or make the SQL skip it); hide bulk status actions for piece-driven
packages and replace them with the canonical ones (release, advance station,
ship); in the zero-leaf branch reset percent only and leave status alone.

### P1 — Drawing readiness ignores the canonical release
- `analytics.js:56-107` reads only the legacy `linked_drawing_ids` text list
  and the sheet's own stage. It never reads `fab_releases` (14 packages are
  released) or `piece_drawing_sets`. A package released through Fab Release
  with an empty legacy list is flagged **"No linked drawings", high severity**
  and lands in the Work Queue; 14 production packages past Detailing have an
  empty list.
- Exception releases are invisible: all 14 live releases are exceptions
  (`is_exception = true`) and the center never shows a release state at all.
- `components.tsx:519` prints "N/M drawings released" from
  `approvedCount` (includes OFS / Approved / Approved-as-Noted) next to a
  "3 sheets not released" flag computed from the strict predicate.

**Fix.** Join `fab_releases` (status, `is_exception`, `weight_tons`,
`released_at`) into the page's package rows and give the release its own
column, pill and filter; treat a released package as drawing-ready; use
`fabReadyCount` for the "N/M released" label.

### P1 — Weighted progress and tonnage are not what they say
- Hero "Weighted Progress" (`analytics.js:220-222`) is tonnage-weighted, but
  36 of 81 packages have no tonnage, so the formula silently falls back to a
  plain average for those and mixes methods across the project. Phase rails
  do the same per phase (`:231-233`).
- Hero "Complete" beside it is `calcWpProgress` = count of packages with
  `status = 'Complete'` ÷ total (`src/utils/projectKpis.js:17-25`). Two
  progress numbers with different definitions sit in the same hero.
- `work_packages.tonnage` is hand-typed (`WPFormModal.jsx:127`) and never
  reconciled with piece weights. The release RPC computes tons as
  `coalesce(weight_total_lbs, each × qty)` (`20260724130000:137-139`) while
  the rollup weights progress by `each × qty` when it disagrees with the total
  by > 1% (`20260801013000:165-179`). Three tonnage numbers, none shared.

**Fix.** One SQL helper `piece_tons(piece)` used by release and rollup; write
the computed piece tonnage into `work_packages.tonnage` from
`refresh_work_package_progress` when piece control is on; drop the count-based
"Complete" stat from the hero or label it "packages closed".

### P2 — Overdue / At Risk are blind
69 of 81 packages have no `scheduled_end_date`, and that is the only date
`overdue` reads (`analytics.js:124-125`; `due_date` is not a column). The
"At Risk" panel and the Overdue chip therefore cover 12 packages.
**Fix.** Fall back to the package's schedule task / delivery date when the
field is blank, and surface "no plan date" as its own flag so it gets filled.

### P2 — Progress rollup is O(N²) and audit-heavy on every assign
`assign_pieces_to_work_package` updates pieces one at a time
(`20260725210000:453-482`); the row trigger calls
`refresh_work_package_progress` per row (`20260904120000:91-97, 106-108`),
each call rescans the package four times and writes `work_packages` (which
fires the audit-log trigger). Assigning 200 pieces = 200 full recomputes and
200 audit rows. Same on CSV import and bulk station advance.
**Fix.** Set `app.skip_wp_progress_refresh` for the loop and refresh once per
touched package at the end (the flag already exists, `20260801013000:39-41`).

### P2 — Canonical release never stamps the package
`release_work_package_canonical_impl` (`20260724130000:154-262`) inserts
`fab_releases` and updates pieces but never sets `work_packages.released_date`,
which Command Center Forward Look and the item drawer read
(`ForwardLookDrawer.jsx:113`, `ItemDetailDrawer.jsx:101`).
**Fix.** Set `released_date = current_date` in the release RPC.

### P2 — Fabrication gate in the edit form contradicts its own banner
`WPFormModal.jsx:110-115` **blocks** save when moving to Fabrication without
"approved" sheets, while the banner (`:331-334`) says it will only raise a
flag. The predicate is the loose set (`:169, :234`) that `analytics.js:5-10`
documents as *not* release-ready, so a package can pass the form and be
flagged "N sheets not released" on the very next render. The error renders
under the Phase field only, so in a seven-section modal the button appears
dead.
**Fix.** Make it a non-blocking warning that uses the canonical predicates,
and focus/scroll the error.

### P3 — Small logic defects
- `WorkPackageDetailModal.jsx:256` / `WorkPackageList.jsx:444` — sheet
  overdue compares UTC midnight to now: a sheet due today reads overdue from
  17:00 the day before in Arizona. Use `toLocalDay`.
- `WorkPackageDetailModal.jsx:286` / `WorkPackageList.jsx:475` —
  `.replace(", 2026", "")` hard-codes the year.
- `analytics.js:124, 298`, `components.tsx:510`, `types.ts:30` read
  `wp.due_date`, which does not exist. Remove.
- `WPFormModal.jsx:336` checks phase `"Installation"`, which the select never
  offers.
- Two identical `updated_at` triggers on `work_packages` (baseline 7670,
  7698).

## 2. Routing and navigation

### P1 — The center is a dead end, and inbound deep links are dropped
- **No outbound navigation exists** in `src/pages/WorkPackages.tsx`,
  `src/pages/workPackages/*` or `src/components/workpackages/*` (no
  `navigate`, `Link` or `createPageUrl`). From a package a PM cannot reach its
  Fab Release, its pieces in the Piece Register, its linked sheets in
  Drawings, or its deliveries.
- **Inbound `?id=` is ignored.** Alerts Center links to
  `/WorkPackages?id=<wp>` (`src/pages/AlertsCenter.jsx:23-30`), but the page
  reads no search params except `?new=1`
  (`useAutoOpenCreate`) and `?project=` (`useProjectId`). RFIs "open WP"
  (`RFIs.jsx:309`), Activity, Project Details and Command Center "View WP"
  (`urgencyEngine.js:369`, `todayView.js:111`) all land on the unfiltered
  list. The RFIs page shows the convention (`RFIs.jsx:139` reads `?id`).
- **On-hold projects render an empty page with no explanation.**
  `entities.Project.list()` excludes `on_hold` rows
  (`entityClient.ts:88-90`), so `selectedProject` is null and the package
  list is forced to `[]` (`WorkPackages.tsx:101-106`) under the header "No
  active project".

**Fix.** Read `?id=` / `?wp=` and open the drawer; add Fab Release, Piece
Register (`/PieceRegister?wp=<id>`), Drawings (`?set=`) and Deliveries links to
the drawer and Register rows; show an "on hold" banner instead of an empty
list.

### P2 — Exception rail routes to the wrong filter
`components.tsx:308-315`: "Drawing gaps" applies `risk = high` (all high-risk
packages, including on-hold and overdue) and "Ready for fab" applies
`phase = Detailing` (every Detailing package, not the ready set).
**Fix.** Add `drawing_gaps` / `ready_fab` filter ids handled in the page's
filter (`WorkPackages.tsx:228-248`).

### P2 — Two package boards
The Piece Register has its own Package Board, and this page has a Board view;
neither links to the other and they show different fields.
**Fix.** Pick one as the operational board and link to it from the other.

## 3. Productivity hindrances

- **P1 — Marking a package complete is four steps** (open drawer → Edit →
  change Status → Update), and on piece-driven projects it is then reverted
  (§1). The drawer's only action is EDIT (`WorkPackageDetailModal.jsx:137-154`)
  and it has no Escape-to-close. Add release / advance / ship / hold actions to
  the drawer and rows, mirroring the Piece Register.
- **P1 — "Ready to Advance" and "Ready for Fab" have no action.** Both panels
  only open the drawer; advancing means editing a free-text phase field.
- **P2 — Register cannot sort.** `components.tsx:439-479` is fixed to
  risk → phase → date → number; no sort by number, tonnage, labor burn, crew or
  name. Board cards have no checkboxes, so bulk actions from Board are
  "Select visible" only. Rows and cards are `div`s with `onClick` only: not
  keyboard reachable.
- **P2 — Drawer goes stale.** It renders the `detailWP` snapshot
  (`WorkPackages.tsx:78, 349`); after a Piece Control action in its own tab the
  Overview keeps the old status and percent until reopened. Read the row from
  the query cache by id.
- **P2 — Bulk actions are thin.** Only Set Complete / Set In Progress / Export.
  No bulk crew, phase, hold, scheduled dates, or "assign pieces".
- **P2 — Bulk Add keeps the previous paste.** `WPBulkAddModal.jsx:228, 264`:
  `raw` is never reset, the modal stays mounted, so reopening shows the last
  rows with the commit button enabled: one click re-imports them.
- **P2 — Edit/Delete render for users who cannot edit or delete.**
  `components.tsx:474, 520, 545` wrap `onEdit`/`onDelete` in always-defined
  arrows, so `RowActions` always draws both buttons; they do nothing.
- **P3** — Detail Overview omits scheduled start/end, area, sequence, trade /
  shipping / install phase even though the form collects them. Drawing-set
  picker is mouse-only. No Ctrl/Cmd+Enter to save. CSV export lacks dates,
  field hours and drawing counts. Creating a package reserves a number before
  the form opens, so Cancel burns a number.

## 4. Integrity, permissions, performance

- **P1 (repo, not live) — a stale migration would grant write to viewers.**
  `20260805030000_drop_project_id_null_rls_escape_hatch.sql:20-41` creates
  `project_member_access … FOR ALL` on 33 tables including `work_packages`,
  keyed on `user_has_project_access`, which after `20260819001000` is true for
  every org member. Permissive policies OR together, so the `field` floor on
  insert/update/delete would be erased. **Production does not carry this
  policy** (verified in `pg_policies` today: only the four per-command
  `project_*` policies exist), because that migration was never applied.
  Applying it to a fresh environment, or a drift sync, would open the hole.
  Delete the policy block from that migration (keep the REVOKEs) before it is
  ever run.
- **P2 — Duplicate package numbers are reachable.** No unique index on
  `(project_id, wp_number)`. The form's Create button has no pending state
  (`WPFormModal.jsx:256`), so a double-click creates two rows with the one
  RPC-reserved number. Bulk Add "flags but allows" numbers that already exist
  (`WPBulkAddModal.jsx:241, 318-319`). Add the partial unique index, disable
  the button while saving, and block commit while duplicates exist.
- **P2 — `refresh_work_package_progress` is callable by any authenticated user
  with no authorization check** (`20260725210000:200-201`,
  `20260801013000:15-210`): any login can force a rewrite of status / percent
  on any package id. Revoke from `authenticated`; triggers run as definer.
- **P2 — Restoring a soft-deleted package loses its pieces.** The soft-delete
  trigger nulls `pieces.work_package_id` (`20260801013000:262-265`); nothing
  re-attaches on restore.
- **P3 — Drawings read is capped at 2,000 with no notice**
  (`WorkPackages.tsx:108-115`); any linked sheet beyond the cap counts as
  "not released". 148 sheets is today's max, so not live, but it is the same
  silent-cap class fixed elsewhere in the 09-04 audit.
- **P3 — Hard DELETE at the `field` floor fails on FKs** (`pieces_work_package_fk`,
  `fab_releases_work_package_fk` have no `ON DELETE`); the app soft-deletes so
  only API callers hit it. Raise the floor to admin.
- **P3 — `fab_releases.status` has no CHECK** and is compared both
  case-sensitively and via `lower()` in different functions.
- **P3 — Edit form performance.** `WPFormModal.jsx:164` rebuilds
  `projectDrawings` every render, defeating the memo; three O(linked ×
  drawings) scans run per keystroke; the pieces probe (`:61-70`) transfers
  every piece row to test `count > 0` (use `head: true, count: "exact"`).

## 5. Design-system and dead code

- **Five of ten components are dead**: `WPGantt.jsx`, `WorkPackageList.jsx`,
  `SiteMapView.jsx`, `WPCostSummary.jsx`, `WorkflowBadge.jsx` have no
  importers; so are `Hero`/`SummaryStrip` in `components.tsx` and ten styles in
  `styles.ts`. The PM has no Gantt or site-map view of packages today. Each
  dead file also carries defects (Gantt writes a non-existent
  `target_end_date` column and shifts `released_date` on click; cost summary
  invents `shop_hours × $60`; workflow badge blocks every Delivery-phase
  package). Delete or revive deliberately.
- **Hardcoded colours** (rule: CSS variables only): `WPBulkAddModal.jsx:384,
  455-458` (dark RGB rows unreadable in light theme), `WorkPackageDetailModal.jsx:27-33,
  61, 80`, `styles.ts:5, 16, 18` (`Space Grotesk` is not a system font).
- **Invalid CSS**: `${color}18` alpha-suffixing a `var()` yields
  `var(--x)18`, which the browser drops, so the drawer's phase/status pills
  (`WorkPackageDetailModal.jsx:401`) and Bulk Add chips (`:552`) have no
  background. Use `color-mix(in srgb, var(--x) 10%, transparent)` as
  `styles.ts` already does. `var(--secondary)` is a shadcn HSL triplet here,
  not a colour (`WorkPackageDetailModal.jsx:31`).
- `WPFormModal.jsx:277` labels project "(optional)" though it is NOT NULL and
  `withProjectId` overwrites the choice; `:92` spreads DB nulls into
  controlled inputs (React warnings on every edit).

## 6. Correct — leave alone
- Work-package numbers come only from `get_next_sequence_number` in single and
  bulk create; bulk preparation fails closed on allocation failure.
- RLS is enabled with explicit per-command policies at the `field` floor;
  helpers use `(select auth.uid())`; every SECURITY DEFINER function sets
  `search_path`; canonical release has a partial unique index, command-keyed
  write guards and a `unique_violation` catch.
- `analytics.js` reuses the Fab Release gate's per-sheet predicates, so the
  KPI strip cannot drift from the P0 gate; keep and extend it.
- Mutations close modals only on success, so input survives an error;
  realtime invalidation on `work_packages` is in the publication and debounced.
- `WPFormModal` strips `percent_complete`/`status` when progress is
  piece-driven; `PhoenixModal` is a plain overlay (no `<form>`, no Radix).

## 7. Recommended order of work
1. Routing: honor `?id=`; add outbound links (Fab Release, Piece Register,
   Drawings, Deliveries); on-hold banner. Small, high daily value.
2. Truth alignment: release state + exception pill in rows/drawer; phase
   derived from canonical state for piece-driven packages; hide bulk status
   actions there; fix exception-rail filters and the "N/M released" label.
3. Actions: release / advance / ship / hold in the drawer and rows; drawer
   reads from cache; Escape; sortable Register; Board checkboxes.
4. Integrity: unique `(project_id, wp_number)` index; pending state on
   Create; block duplicate bulk numbers; revoke `refresh_work_package_progress`
   from `authenticated`; batch the rollup; stamp `released_date`; single
   `piece_tons` helper; neutralize the stale policy migration.
5. Cleanup: delete the five dead components and unused styles; colours to
   variables; date and null-handling nits; drawings read paged.
