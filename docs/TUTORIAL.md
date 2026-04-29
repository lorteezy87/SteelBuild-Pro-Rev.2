# SteelBuild Pro — Comprehensive Tutorial

This guide walks through every major area of SteelBuild Pro (SBP), how to use each module, and — most importantly — how the modules integrate so the data you enter once shows up everywhere it belongs.

The app is built around one idea: **a steel project is a single connected graph.** A drawing set begets a submittal, a submittal raises an RFI, an RFI changes a work package, a work package drives fab release, a fab release schedules a delivery, a delivery shows up in a daily log. Every screen below is a different view onto the same graph, not a separate filing cabinet.

---

## 1. First Login & Orientation

### 1.1 Logging in

Navigate to the app URL and sign in with your work email. Auth is handled by Supabase; if you don't have an account yet, ask a project admin to invite you from **User Management** (top-bar **MODULES → Job Setup → User Management**).

### 1.2 The chrome — what's on every page

Every screen has the same outer frame:

- **Top bar (always visible):**
  - Left: app logo, **MODULES** mega-menu dropdown, primary tab strip (DASHBOARD, PCC, PROJECTS, RFIs, DRAWINGS, FABRICATION, DELIVERIES, SCHEDULE, FIELD, COST, RESOURCES, REPORTS, QUALITY, CLOSEOUT)
  - Right: project picker (the most important control on the screen — see §1.3), notifications bell, your avatar / settings menu
- **Sidebar (left, collapsible):** secondary nav grouped by function (OVERVIEW, PROJECT MANAGEMENT, DESIGN & DRAWINGS, PRODUCTION, FINANCIALS, DOCUMENTS & REPORTS, FIELD, ADMINISTRATION, TOOLS). Click a group label to collapse/expand; the state persists per browser.
- **Breadcrumb:** active section path under the top bar.
- **Command bar (per page):** every list page has a header strip with a title, a count of visible vs. total rows, and primary actions (**+ NEW …**, **BULK ADD**, etc.).
- **KPI tiles:** clickable; clicking a tile applies the matching filter to the list below. Click "Total" to clear filters.
- **Bulk action bar:** appears at the bottom of the screen the moment you select two or more rows on a list page that supports bulk ops (RFIs, Submittals, Drawings, Schedule, Action Items). Bulk edit, bulk delete, bulk re-stage are common.

### 1.3 Project picker — the one control that drives everything

The **Active Project** picker (top right) gates almost every page. Most pages query `where project_id = activeProject.id`, so:

- If you see **"Select a project to view …"** with a faded list, the picker is unset. Click it and pick a project.
- Switching projects refetches every list on screen — there's no manual reload step.
- The Portfolio Overview, Executive View, Command Center, and Reports pages are intentionally cross-project — they don't depend on the picker.

### 1.4 Two ways to navigate

- **Top tabs** (DASHBOARD, PCC, PROJECTS, …) get you to the headline page in each functional area in one click.
- **MODULES dropdown** (top-left) is the full catalog — three columns, grouped by Overview / Job Setup / Documents & Drawings / Communications / Fabrication / Deliveries / Field / Scheduling / Cost Control / Reporting / Tools. Use it when you know exactly what you want.
- **Sidebar** holds the same items grouped slightly differently for fast vertical scanning during day-to-day work.

---

## 2. Setting Up a New Project

The order matters — later modules reference earlier ones.

### 2.1 Create the project

**MODULES → Job Setup → Projects → + NEW PROJECT.**

Required fields: project name, project number, owner/GC contacts, start date, contract value, primary discipline. Optional but strongly recommended at creation: project address (drives weather + drive-time calculations), contract type, and a project color (used as a tint across portfolio dashboards).

Once created, the project shows up in the Active Project picker and in **Projects** as a card.

### 2.2 Define scope

**Scope & Exclusions** (Job Setup → Scope & Exclusions). One row per scope item ("Furnish & install structural steel for Building A — east wing only"), one row per exclusion ("By others: anchor bolts, embeds, base plate grouting"). These pull into Job Status Reports, Change Order narratives, and the Project Control Center contract sidebar.

### 2.3 Add contacts

**Contacts** (Job Setup → Contacts). Owners, GCs, EORs, architects, subs, suppliers. Each contact gets a role tag (EOR, Architect, Owner, GC, Sub, Vendor) and optional company. RFIs, submittals, and meetings auto-suggest from this list.

### 2.4 (Optional) Stage-gate dates

Projects > project card > Detailing has milestone date fields (kick-off, IFC, BFA out, BFA back, fab start, ship-start, last-piece-shipped, install-start, install-complete). Filling these enables the timeline ribbon on the Command Center and Portfolio Overview.

---

## 3. Drawings & Submittals

This is where most projects spend most of their time. The two modules are tightly coupled — a drawing set is what a submittal transmits.

### 3.1 Drawings

**MODULES → Documents & Drawings → Drawings & Submittals** (sometimes labeled just "Drawings").

Two grain levels:

- **Drawing set** — the package as it goes out for review (e.g., "Erection Plans Round 1", "Connection Details R0"). Created automatically when you upload, or imported as a "set-only" record from a Drive folder (see §3.5).
- **Drawing sheet** — an individual sheet within a set (S-1.01, S-1.02, …). Tracked one row per sheet, with stage (Detailing → IFC → For Review → Approved → Released → Issued for Construction), revision, due date, reviewer, AI extraction status.

#### Adding sheets

- **+ NEW SHEET** for a single sheet — manual entry or upload a PDF.
- **+ UPLOAD SET** to drop a multi-sheet PDF; SBP splits it page-by-page, runs the AI titleblock extractor, and creates one row per sheet.

#### Mark a titleblock template

For repeat sets from the same detailer, click **Mark Titleblock** on the set group header, draw boxes on the PDF over the sheet number and sheet title regions, save. Future uploads pull straight from those rectangles instead of re-running OCR.

#### Stage advancement

- Single-sheet: click the stage chip on a row to advance.
- Bulk: select rows → bottom action bar → **APPLY STAGE → <stage>**.
- Set-level approval: on the group header, click **REVIEW SET** → choose Approved / Rejected / Pending Review / Superseded. This sets `set_approval_status` on the drawing_sets row and rolls up to portfolio dashboards.

#### AI Drawing Analysis

**MODULES → Documents & Drawings → Drawing Analysis (AI)** is a focused sub-page. Per sheet, click **Analyze**: extracts sheet number, title, revision, discipline, scale, and any callouts the model can identify. Results land back on the Drawings list as `ai_extraction_status = Extracted` (or `Needs Review` / `Failed`).

Stuck sheets — if you close the tab mid-extraction the extractor row gets reconciled to `Failed` on next page mount, with a toast telling you how many were reset. No manual cleanup needed.

#### Drawing Viewer

Click any sheet → **VIEW** opens **Drawing Viewer** in a new tab. Defaults to a browser-native PDF iframe; toggle the toolbar **PDF.js Canvas** mode if you need annotations / zoom-pan precision.

### 3.2 Submittals (Submittal Register)

**Sidebar → Project Management → Submittal Register** (or top-bar MODULES → Communications → Submittal Register).

A submittal is the **transmittal artifact** — what you sent, when, to whom, what round, what status, who has the ball. It is *not* the drawings themselves; it's the workflow record that wraps a drawing set.

#### Creating one

- **+ NEW SUBMITTAL** — opens the form modal. Required: number + title. Type defaults to "Shop Drawing"; status defaults to "Draft"; ball-in-court defaults to "EOR".
- **BULK ADD** — for log-importing a backlog. Two modes:
  - **CSV PASTE:** paste a tab- or comma-separated block from Excel. First row is the header. Recognized columns: `submittal_number, title, discipline, submittal_type, status, ball_in_court, required_date, submitted_date, spec_section, submitted_by, notes`. SBP normalizes case/punctuation and clamps `submittal_type` / `status` to canonical enums (so "shop drawing" pastes fine as "Shop Drawing"; an unrecognized status becomes Draft).
  - **SEQUENTIAL:** seed a starting number ("S-001"), a count, and an optional title prefix → SBP generates N draft rows with the trailing digit incremented to the same pad width.

#### Inline-editing the detail panel

Click a row → detail panel on the right. **Every field is click-to-edit** — title (header), type (select), discipline, spec section, revision, dates, submitted-by, reviewer, notes. Enter commits, Esc cancels, blur commits. Notes use Cmd/Ctrl+Enter so bare Enter inserts a newline. A no-op edit (typing the same value back) silently exits — no toast spam.

#### Status workflow

The Status section on the detail panel is a pill row: Draft / Submitted / Under Review / Approved / Approved as Noted / Revise and Resubmit / Rejected / Void. Click a pill to advance — it's a one-field patch, no modal.

#### Ball-in-court chips

Right under Status. Click to flip — Contractor / EOR / Architect / GC / Owner / Subcontractor.

#### Linking to drawing sets (the integration that makes Submittals real)

The detail panel has a **Linked drawing sets** section. Click **+ LINK DRAWING SET** → pick from the project's sets. Linked sets show as accent chips with an `×` to unlink. A linked set that's been deleted shows up as a dashed "(missing set)" chip so you can clean up.

The reverse view: when you go to the **Drawings** page, each set's group header now shows a "**N SUBMITTALS · M OPEN**" chip. "Open" excludes Approved / Approved as Noted / Void, so it counts work still in flight against that set.

#### Bulk operations

- **Bulk edit:** select rows → bottom bar → EDIT SELECTED → choose which fields to change. Each field has a "Don't change" toggle; only enabled fields get patched. Notes can be **appended** instead of replaced (look for the "Append, don't replace" toggle).
- **Bulk delete:** soft-deletes rows. The unique index on `(project_id, submittal_number)` is partial — it ignores soft-deleted rows — so you can recreate the same number after deletion without conflicts.

### 3.3 Document Repository

**MODULES → Documents & Drawings → Document Repository.** Catch-all storage for anything that isn't a structured drawing/submittal/RFI/contract — specs, RFP backups, calc reports, miscellaneous PDFs. Tag with category, link to a project. Supports drag-drop upload.

### 3.4 3D Model Viewer

**MODULES → Documents & Drawings → 3D Model Viewer.** Loads `.frag` (Tekla / IFC compiled to fragments) into a WebGL scene using `@thatopen/components`. Spin, section, isolate, hide assemblies, click a member to see metadata.

If you're upgrading the `@thatopen/fragments` package, re-copy `node_modules/@thatopen/fragments/dist/Worker/worker.mjs` to `public/thatopen/fragments-worker.mjs` — the worker URL is hard-served and won't bundle.

### 3.5 BFA pilot: Drive → SBP round-trip

If your drawing sets live in Google Drive (BFA workflow), you can import a folder as a **set-only** record — no per-sheet rows yet, just the set metadata + a Drive link. The set group header on the Drawings list shows a `SET · FROM DRIVE` chip and an `OPEN DRIVE ↗` button.

Round-trip events (sent / returned / revised) update the set's `revision_history` and `event_count` so you can see "12 round-trips, latest: Submitted Round 3" without leaving SBP.

---

## 4. Communications

### 4.1 RFIs (RFI Hub)

**Top tab → RFIs**, or **MODULES → Communications → RFI Hub**.

The RFI module has three layers:

- **RFI list** — same shape as Submittals: KPI tiles (Total / Pending / Answered / Overdue), filter bar, list + detail panel.
- **RFI Hub** — adds a kanban-style board across response status (Open / Pending / Answered / Closed) so you can drag RFIs across columns.
- **RFI Log Import** — paste a backlog from Bluebeam / Procore CSV exports; same mapping engine as the Submittals bulk-add.

#### Linking RFIs to drawings

When you create or edit an RFI, the **Linked drawings** field accepts sheet numbers. Sheets you reference appear as chips on the RFI detail panel; the Drawings list shows a small RFI badge next to any sheet that has open RFIs against it. The badge color tracks the highest-severity open RFI on that sheet.

#### Comments

Every RFI detail panel has a **Discussion** section (CommentThread). Same component is wired into Submittals, Action Items, and Production Notes — paste a screenshot, mention a teammate (`@`), thread replies. Comments respect project membership (RLS).

### 4.2 Submittal Register

Covered in §3.2.

### 4.3 Production Notes

**MODULES → Communications → Production Notes.** Longform notes from the shop floor — fit-up issues, weld procedure deviations, paint reworks. Each note is tagged with a discipline + workzone and shows up in Daily Logs / LEMs as supporting context.

### 4.4 Meetings

**MODULES → Communications → Meetings.** Schedule a meeting (or import from Google Calendar via the Calendar MCP), attach attendees from Contacts, drop in an agenda. After the meeting, capture minutes. Action items from the minutes auto-create rows in **Action Items** with the meeting linked as the source.

### 4.5 Action Items

**MODULES → Communications → Action Items.** A simple ticketing surface — title, owner, due date, status, source (RFI / Meeting / Inspection / Manual). Same bulk add/edit/delete pattern as Submittals.

---

## 5. Fabrication

This is where SBP gets opinionated about steel-shop workflow.

### 5.1 Work Packages

**Top tab → FABRICATION → Work Packages.**

A work package = a logically grouped chunk of fabrication work that gets released, scheduled, and tracked as a unit ("WP-101: West core columns L1–L5"). Each package carries:

- `tonnage` (or `lbs`), `piece_count`, `sequence_number`
- `release_status` (Pending / Released / On Hold / Re-released)
- `fab_start`, `fab_complete`, `ship_target`
- `linked_drawing_set_ids`, `linked_rfi_ids`
- `budget_hours` (target + actuals roll up from BudgetHours module)

#### Operations

- **+ NEW PACKAGE** for a single package, or **BULK ADD** for an Excel paste.
- Drag-to-resequence to change sequence_number.
- **Indent / outdent** turns packages into parents and children — use this for "WP-100 (parent: West core)" → "WP-101 / WP-102 / WP-103" children. Parents auto-roll-up tonnage and hours.
- **Bulk re-stage:** select packages → bottom bar → RELEASE / HOLD / UNRELEASE.

#### Integration points

- Linked drawings: clicking a linked drawing chip jumps you to the Drawings page filtered to that set.
- Constraints: open constraints against a package show as a red dot on the row.
- Schedule: each package can be linked to a Schedule task; updating one updates the other (one-way for now — Schedule is the source of truth for dates).

### 5.2 Constraints

**MODULES → Fabrication → Constraints.** A constraint is anything blocking a work package — missing material, open RFI, unanswered submittal, schedule conflict, manpower hold. Each constraint has:

- `category` (RFI, Submittal, Material, Engineering, Resource, Other)
- `severity` (Critical / High / Medium / Low)
- `linked_package_ids`
- `expected_clear_date`

The Look-Ahead Schedule (§5.6) refuses to schedule work past an unresolved Critical or High constraint.

### 5.3 Fab Release

**MODULES → Fabrication → Fab Release.** The release authorization queue. Packages flow into Fab Release once their drawings are Approved AND their constraints are cleared (or formally accepted).

The Fab Release page shows a release matrix: rows = packages, columns = release-readiness checklist (drawings approved, constraints cleared, material in-house, hours budgeted, sequencer signed). Click into a row to release; the timestamp + signer + revision-as-released is captured for audit.

### 5.4 Budget Hours

**MODULES → Fabrication → Budget Hours.** Hours allocation per work package by labor category (detailing, fitting, welding, fabricator-supervisor, paint, ship-out). Actuals come in from LEMs (§7.4); variance = budgeted − actual − projected-to-complete.

### 5.5 Procurement

**MODULES → Fabrication → Procurement.** Mill and supplier orders. Each PO links to one or more work packages, tracks ROS (required-on-site), expected ship, and actual receipt. Late mill orders surface as a constraint automatically.

### 5.6 Look-Ahead Schedule

**MODULES → Fabrication → Look-Ahead** (also under Scheduling). A pull-planning surface: 6-week look-ahead grouped by week-of, color-coded by constraint health. Drag work-package bars left/right to re-plan; SBP enforces the constraint rule (red bars on un-cleared constraints).

---

## 6. Schedule, Calendar, Resources

### 6.1 Schedule (Gantt)

**Top tab → SCHEDULE** opens the Gantt.

- Rows are **schedule_tasks** — hierarchical (summary tasks have `is_summary = true`; child tasks roll up).
- Columns: Task name, Duration, Start, Finish, % Complete, Predecessors.
- The Gantt area on the right scales by zoom level (Day / Week / Month / Quarter).

#### Importing MPP

**Schedule → IMPORT MPP** accepts a Microsoft Project XML export. SBP parses summary tasks, predecessors, calendars, and durations. Existing tasks aren't overwritten — newly imported tasks are added with `Imported` status until you accept them.

#### Inline editing

- Click a task name to rename.
- Click a date column to open a date picker.
- Drag a bar to slip a task; SBP recomputes downstream predecessors.
- Right-click a task for indent / outdent / insert above / insert below / delete.

#### Linking schedule to other modules

- A schedule task can carry `linked_work_package_ids`, `linked_submittal_ids`, `linked_rfi_ids`. Linked items show as small chips on the bar.
- Critical-path tasks are highlighted with a red border.
- Slipping a parent (summary) task slips children proportionally.

### 6.2 Project Calendar

**Top tab → SCHEDULE → Project Calendar** (or sidebar). Month / week / day calendar surfacing every dated artifact: schedule task starts/ends, RFI due dates, submittal required dates, deliveries, inspections, meetings. Each event type has a distinct color.

Two-way Google Calendar sync is available if the Calendar MCP is connected.

### 6.3 Crew Scheduling

**MODULES → Resources → Crew Scheduling.** Per-person daily/weekly assignment grid. Columns are dates, rows are people, cells show their assignment for the day (project + workzone + role). Conflicts (a person assigned to two projects on the same day) highlight red.

### 6.4 Resource Management

Higher-level than Crew Scheduling — covers **resources** (people, crews, equipment) by capacity. Use this to plan headcount vs. demand by week, see utilization curves, and surface under-staffed weeks.

---

## 7. Field

### 7.1 Field Hub

**Top tab → FIELD** lands on Field Hub — a project-scoped dashboard for the field team. Today's deliveries, today's inspections, open punchlist items, recent daily logs.

### 7.2 Daily Logs

**MODULES → Field → Daily Logs.** One row per crew per day. Fields: weather (auto-fetched from project address), crew size, hours worked, hours by labor category, work performed (free text), photos (linked to Photos module), production notes (linked to Production Notes).

Daily logs are the source of truth for **actual hours** that flow into Budget Hours variance.

### 7.3 Photos

**MODULES → Field → Photos.** Project photo gallery with EXIF capture (date, GPS), tag categories (Pre-pour, Erection, QA, Damage, Other), and per-photo comment threads. Linkable from Daily Logs, Inspections, Punchlist items.

### 7.4 LEMs (Labor / Equipment / Material)

**MODULES → Field → LEMs.** Daily T&M tickets — labor hours, equipment usage, material installed. Used both for billable T&M change orders and for actuals tracking. Each LEM ties to a project, optional work package, and optional cost code.

### 7.5 Inspections

**MODULES → Quality → Inspections.** Inspection requests + results — shop QA, field welds inspections, fireproofing, paint DFT, bolted-connection torque-checks. Each inspection has a checklist (loaded from a templates table), a status (Scheduled / In Progress / Passed / Failed), and a results blob with photos.

Failed inspections auto-create a Punchlist item for rework.

### 7.6 Punchlist

**MODULES → Quality → Punchlist.** Field defect tracking. Title, location (workzone + grid + elevation), responsible party, due date, status (Open / In Progress / Verified / Closed), photos.

### 7.7 Safety

**MODULES → Quality → Safety.** Safety incidents + JSAs (Job Safety Analyses). Incident severity, witness statements, corrective actions. Pulls into the Safety section of the Job Status Report.

### 7.8 Quality Control

**MODULES → Quality → Quality Control.** Wider than Inspections — catches NCRs (non-conformance reports), CAR/PARs, weld procedure qualification records, paint procedure qualifications, mill-cert tracking.

---

## 8. Cost Control

### 8.1 Budget Control (Financials)

**Top tab → COST → Budget Control.** Top-level financials dashboard — contract value, change orders, billed-to-date, cost-to-date, projected-final-cost, gross profit forecast.

### 8.2 Schedule of Values

**MODULES → Cost → Schedule of Values.** AIA G702/G703-style SOV grid. Rows are SOV line items, columns are billing periods. SBP computes percent-complete by line, retainage, billed-this-period, billed-to-date, balance-to-finish.

### 8.3 Change Orders

**MODULES → Cost → Change Orders.** Internal CO tracking with approval workflow:

- `co_number`, `description`, `amount`, `originator` (Owner / GC / Internal)
- Status: Pending / Approved / Rejected / Void
- Linked RFIs, linked submittals, linked work packages
- Pricing rollup (T&M + lump-sum + markup)

Approved COs flow into Budget Control as adjustments to contract value.

### 8.4 Contract Management

**MODULES → Cost → Contract Management.** Master contract + amendments tracking. Pulls scope, exclusions, contract value, retainage % from Project setup, surfaces them as a single page for legal/admin review.

### 8.5 Expenses

**MODULES → Cost → Expenses.** Project-level expense tracking — receipts, expense categories, reimbursable vs. non-reimbursable. Actuals on the Project Status Matrix read from this table.

---

## 9. Reporting & Insights

### 9.1 Job Status Report

**MODULES → Reporting → Job Status Report.** A monthly executive narrative for one project — auto-populates schedule status, financial status, safety status, open RFIs, open submittals, open COs, recent issues, mitigations. Export to PDF for owner/GC distribution.

### 9.2 Portfolio Overview

**MODULES → Reporting → Portfolio Overview** (also `AIInsights`). Cross-project at-a-glance — every project as a card, color-coded by health, with the **Project Status Matrix** (rows = projects, columns = budget, schedule, RFIs open, submittals open, safety incidents, days-to-shipping). The matrix's "Actual" column reads from Expenses (not the deprecated `cost_codes` column).

### 9.3 Decision Log

**MODULES → Reporting → Decision Log.** Auto-captured significant decisions across the app — RFI answered, CO approved, schedule baselined, scope-locked, and so on. Filterable by date range and decision type. Useful for audits and post-project lookback.

### 9.4 Activity Log

**MODULES → Reporting → Activity Log.** Every CRUD on every entity, with user, timestamp, before/after diff. Use this when something changed and you don't know who or when.

### 9.5 Mitigations

**MODULES → Reporting → Mitigations.** Risk-and-mitigation register. Identified risks (Schedule / Cost / Quality / Safety / Resource), mitigation strategies, responsible parties, status. Pulls into the Risk section of the Job Status Report.

### 9.6 Alerts Center

**Top-bar bell icon** opens a flyout; the full page is **MODULES → Job Setup → Alerts**. Real-time alerts pushed when an RFI goes overdue, a Critical constraint is created, a schedule task slips its baseline, a safety incident is reported, etc. Each alert has a severity color and a dismiss action.

---

## 10. Tools

Hidden under **MODULES → Tools** (or sidebar TOOLS). All work offline against the active project's units (imperial vs. metric).

### 10.1 Calculator

A scientific calculator with construction-specific functions (sin/cos in degrees, polar/rectangular conversion).

### 10.2 Ft/In Calculator

Add / subtract / multiply / divide feet-inches-fractions: `12'-3 1/2" + 5'-7 3/4" = 17'-11 1/4"`. Result is also exposed as decimal.

### 10.3 Steel Weight Calculator

Section table lookup (W/HSS/L/C/MC) → length → weight in lbs and kg. Or input a custom plate / built-up section by dimensions.

### 10.4 Crane Pick Calculator

Pick weight + radius + boom length → max-load chart lookup → factor of safety. Critical-pick mode flags loads above 75% of chart capacity.

### 10.5 Decimal / Fraction Converter

Round-trip between decimal feet, decimal inches, and `ft-in-fraction` strings. Handy when reading an Excel column that has `0.7917` and you need `9 1/2"`.

---

## 11. Cross-Module Integration Cheat Sheet

The data graph is the point of the app. Here are the most-used paths:

| You did this …                            | These places update automatically                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approve a drawing set                     | Submittals linked to that set show "Approved" rollup • Work packages whose drawings are this set become release-eligible • Activity Log entry          |
| Mark a submittal "Revise and Resubmit"    | Linked drawing sets show open submittal chip • Schedule tasks linked to those packages get a flag • RFIs raised about those drawings inherit the round |
| Open an RFI                               | Linked drawings show RFI badge • Linked work package shows constraint flag if RFI is High/Critical • Alerts Center notifies BIC                          |
| Release a work package (Fab Release)      | Schedule task auto-flips to "In Progress" if linked • Procurement page shows ROS countdown • Budget Hours starts variance tracking                       |
| Save a Daily Log                          | Budget Hours actuals update • Field Hub today-card refreshes • LEM rows can be promoted to T&M COs                                                       |
| Create a CO                               | Budget Control adjusts contract value • SOV recompute • Job Status Report monthly snapshot picks it up                                                  |
| Fail an Inspection                        | Punchlist auto-creates rework item • Quality Control NCR optional • Activity Log + Decision Log entries                                                |
| Slip a Schedule task                      | Look-Ahead re-renders week alignment • Linked work packages flag risk • Portfolio Overview project health degrades if critical-path                      |

---

## 12. Common Workflows

### 12.1 "Project just kicked off — what do I do?"

1. **Job Setup → Projects → + NEW PROJECT** (fill stage-gate dates if you can).
2. **Scope & Exclusions → +** (add 5–15 scope rows).
3. **Contacts → +** (add EOR, Architect, GC, key subs).
4. **Drawings → UPLOAD SET** with the IFC/contract drawings; mark titleblock once.
5. **Submittal Register → BULK ADD** the planned submittal log (sequential mode is great for "we'll have 24 connection submittals").
6. **Work Packages → BULK ADD** the planned work breakdown (one row per package).
7. **Schedule → IMPORT MPP** if you have a CPM schedule from the GC; else **+ NEW TASK** the major milestones manually.

### 12.2 "Drawings came back from the EOR — process the round-trip"

1. **Drawings page → set group header → REVIEW SET** → Approved / Rejected / Pending.
2. If sheet-by-sheet: select rows → **APPLY STAGE → For Review → Approved**.
3. **Submittal Register → submittal row** → flip status pill → "Approved" / "Approved as Noted" / "Revise and Resubmit". Add notes inline if there's a markup summary.
4. If "Revise and Resubmit": **+ NEW SUBMITTAL** with same number, round_number = previous + 1; link the same drawing set (or a revised set if the detailer issued one).
5. The Drawings set group header now shows the new submittal in its open count.

### 12.3 "EOR sent comments — raise an RFI"

1. **RFIs → + NEW RFI** with a clear question and the proposed answer.
2. Link the affected drawings (sheet numbers).
3. Link any submittal that this blocks.
4. Set ball-in-court to EOR, status to Open.
5. Watch the linked drawings show an RFI badge until the RFI is answered.
6. When the EOR answers, paste the answer in the **Discussion** thread, flip status to "Answered", set BIC back to Contractor. The badge clears.

### 12.4 "Release a work package to fab"

1. **Work Packages → row** → check the drawings linked are Approved.
2. **Constraints → filter by package** → ensure no Critical / High open.
3. **Fab Release → row** → click each readiness column to confirm; sign as releaser. Status flips to Released, the timestamp + revision-as-released is captured.
4. **Budget Hours → row** auto-shows budget vs. zero actuals; LEMs entered against this package now feed actuals.

### 12.5 "Owner approved a CO — work it through the books"

1. **Change Orders → row** → flip status to Approved.
2. **SOV →** add a new line item for the CO scope (or amend an existing line).
3. **Budget Control →** verify contract value adjustment shows up.
4. **Job Status Report →** the next monthly report picks up the CO automatically.

### 12.6 "Punchlist walk after install"

1. **Punchlist → + NEW** for each defect with photos and location.
2. Assign each item to the responsible party with a due date.
3. Walk again next week — flip resolved items to Verified, photo proof attached.
4. Closeout package generates from the cleared list.

---

## 13. Tips & Gotchas

- **The Active Project picker is sticky per browser tab.** If a teammate sends you a link and the page is empty, check the picker.
- **Soft delete is real but invisible.** Deleting a row sets `is_deleted = true` — it doesn't physically remove the row. Recreating with the same number works because of partial unique indexes (drawing_sets, RFIs, submittals).
- **Bulk add on Submittals normalizes enums.** If your CSV has `status = pending`, SBP clamps it to `Draft` (not in the enum). Same for `submittal_type`. Empty cells become NULL, not empty string.
- **Inline-edit is everywhere now.** RFI and Submittal detail panels — every meta cell is click-to-edit. Esc cancels, Enter commits, Cmd/Ctrl+Enter for textareas.
- **Cmd+K / Ctrl+K** opens the Command Center quick-jumper from any page (search projects, RFIs, submittals, work packages by number/title).
- **The 3D Model Viewer needs the worker file.** If you see "FragmentsManager.init" errors, the worker URL didn't resolve — verify `public/thatopen/fragments-worker.mjs` exists.
- **PDF viewer falls back gracefully.** If the iframe mode doesn't render (browser quirk, file too large), toggle to PDF.js Canvas mode.
- **A "Failed to fetch" banner usually clears with a hard refresh** — it's a transient network/CORS hit on the Supabase REST endpoint, not an outage. If it sticks, check the browser Network tab for `(failed) net::ERR_FAILED` and re-auth.
- **Comments are project-scoped via RLS.** A user not on the project membership won't see — or be able to add — comments. Add them through User Management.
- **Activity Log is the truth.** When two people remember an event differently, the Log doesn't.

---

## 14. Where to go next

- **First-time admin:** spend 30 minutes in Settings setting up the project default (units, currency, week start day), then walk through §2 and §3 with one real project.
- **Day-to-day PM:** live in Submittals, RFIs, Schedule, and the Project Calendar. The bottom action bar is your friend.
- **Field super:** Field Hub → Daily Logs → Photos. Punchlist is the closeout finisher.
- **Detailing lead:** Drawings + Submittal Register + Look-Ahead. Mark titleblocks on every set; AI extraction saves hours.
- **Controller / accounting:** Budget Control + SOV + Change Orders + LEMs (for T&M billing).
- **Owner-facing PM:** Job Status Report + Decision Log + Portfolio Overview.

If a feature isn't in this guide, check the **MODULES** dropdown — it lists every page in the app. If something's missing or stale, file it in **Action Items** with category = Documentation and assign to the SBP team.

---

## 15. What's New — Recent Releases

Newest at the top. Each entry lists the user-facing change and the kind of integration (forward / reverse / cross-module) it affects.

### 2026-04-29

- **Tutorial / Help in the app shell.** This document is now reachable from the sidebar (**Administration → Tutorial / Help**) and from the Modules dropdown. It renders inside the app — no leaving for GitHub. The same source markdown lives in `docs/TUTORIAL.md` so doc and code travel together.
- **"What's New" section.** This list. Fed by every shipping commit so the team can see what changed without spelunking the commit log.

### 2026-04-28

- **Submittal ↔ Drawing-Set linking (forward + reverse).** Submittals now carry a "Linked drawing sets" section on the detail panel — chip per linked set, `+ Link drawing set` picker, click `×` to unlink. Reverse view: every drawing-set group header on the Drawings page now shows `N SUBMITTALS · M OPEN`. "Open" excludes Approved / Approved as Noted / Void so the chip flags real work in flight against that set. Storage uses the existing `submittals.drawing_set_ids` (`uuid[]`); no migration needed.
- **Submittal detail panel is fully inline-editable.** Every `<Meta>` cell (title, type, discipline, spec section, revision, submitted/required/returned/approved dates, submitted-by, reviewer, notes) is now click-to-edit. Enter commits, Esc cancels, blur commits; notes use Cmd/Ctrl+Enter so bare Enter inserts a newline. No more round-tripping through the Edit modal for a one-character fix.
- **Submittal bulk-add hardened against PostgREST 400s.** CSV paste / sequential add now: backfill missing `title` from `submittal_number` (and vice-versa) so NOT NULL never trips, clamp `submittal_type` and `status` to canonical enums (case- and punctuation-insensitive — "shop drawing" → "Shop Drawing"), drop empty `submittal_type` so the column falls back to NULL instead of failing the CHECK.
- **Recycled submittal numbers can be reused.** Migration 067 swapped the `(project_id, submittal_number)` unique constraint for a partial unique INDEX excluding soft-deleted rows. Same shape as drawing_sets (mig 029) and rfis (mig 030). You can now soft-delete a submittal and recreate the same number cleanly.

### Earlier this month

- **Submittal Register sidebar entry.** New `Submittal Register` item in the Project Management sidebar group; matching entry in the Modules dropdown's Communications column.
- **Submittal bulk operations.** Bulk add (CSV paste + sequential), bulk edit (with "Don't change" toggle per field and notes-append sentinel), bulk delete. Mirrors the RFI page exactly.
- **Schedule MPP import: `is_summary` column.** Migration 066 added the missing `is_summary boolean` to `schedule_tasks` so MPP imports stop failing with a schema-cache error.
- **Project Status Matrix actuals reads Expenses, not the deprecated `cost_codes` column.** Portfolio Overview now shows truthful actuals.
- **Reports module audit pass.** SOV dedupe, ProjectDetails column truthing, PHASES alignment, shared predicates so the same numbers appear on every report.
- **Drawings + Submittals max-separation color palettes per stage/status.** Adjacent statuses no longer collapse into the same color tile.
