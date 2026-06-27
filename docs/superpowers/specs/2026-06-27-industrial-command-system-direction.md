# SteelBuild Pro — Industrial Command System (Design Direction)

Date: 2026-06-27
Status: Authoritative design direction (owner brief) — supersedes/refines the Phase 2
module design-language spec.
Owner: Nick

This is the canonical visual direction for aligning the whole app with the upgraded
dashboard/launcher. Procore-level SaaS structure + construction command-center visuals +
dark premium industrial UI. Serious construction operations platform — not playful, not
generic, not "hacker terminal."

## Core concept
- **Dashboard = Launcher.** Keep as-is: photographic module tiles, white outline icons,
  rounded cards, gold accents, "mission control" feel. This is the visual anchor.
- **Every module page = Workbench.** Same visual system, more data-focused. Modules
  inherit the dashboard's visual weight, icon language, and construction identity.

## The mismatch we're fixing
Module pages (Detailing/RFI) currently feel like a developer/terminal dashboard: dense
dark cards, lots of small uppercase text, too many outlined boxes, little construction
imagery. They must inherit the dashboard's visual weight, icon language, and construction
identity — without losing data density.

## Standard module page structure (apply everywhere)
```
App Shell (left icon rail · top project pill · search · notifications · user)
  Page container
    1. Module Hero Header  (dark construction imagery, white outline icon, title,
                            subtitle, project context, high-level status chips)
    2. KPI Strip           (consistent KPI cards: totals, status counts, overdue,
                            readiness, exposure, progress)
    3. Tabs / Views        (one pill style across modules)
    4. Primary Content Grid
         Left ~60%: Main Work Queue
         Right ~40%: Decision / Risk / Action Panel
    5. Search + Filters row
    6. Detailed Table / Board
```

## Palette (dark construction SaaS)
```
--bg-main:   #05080D   --bg-shell:  #0A111A   --bg-panel: #101722
--bg-card:   #131C28   --bg-card-hover: #182536
--border-soft: rgba(255,255,255,0.08)   --border-strong: rgba(255,255,255,0.16)
--text-main: #F4F7FA   --text-muted: #9AA7B4   --text-faint: #66727F
--accent-gold: #D7A928 (BRAND)   --accent-orange/warning: #F59E0B
--accent-cyan/info: #38BDF8   --accent-green/success: #22C55E   --danger: #EF4444
```
Gold is the brand accent (priority + identity). Teal/cyan is a *secondary* technical
accent only — not used everywhere.

## Typography
- **Main SaaS font** (Inter/Geist/Manrope feel) for titles, body, buttons, cards.
- **Monospace** (JetBrains/IBM Plex Mono) ONLY for: project numbers, drawing numbers,
  RFI IDs, status codes, technical metadata.
- Do NOT make the app monospace or all-caps. Kill the terminal feel.

## Card language (three types)
- **A. Image module cards** — dashboard launcher tiles only (photographic). Unchanged.
- **B. Workbench cards** — inside module pages:
  ```
  background: linear-gradient(180deg, #141D2A 0%, #0D141F 100%);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.28);   /* hover: elevate */
  ```
- **C. Risk/action cards** — urgent items only. Red/yellow outlines used SELECTIVELY so
  they feel special. Too many outlined panels today dilutes impact.

## Buttons
- Primary: `linear-gradient(180deg,#E0B032,#B8860B)`, dark text (#101010), radius 10, bold.
- Secondary: `#141C28`, `1px solid rgba(255,255,255,0.12)`, text #F4F7FA.
- Danger: `rgba(239,68,68,0.12)`, `1px solid rgba(239,68,68,0.45)`, text #FCA5A5.

## Status badges (one vocabulary app-wide)
Overdue · At Risk · In Review · Approved · Needs Action · Fab Ready · Field Ready ·
Blocked. Same shape, spacing, font-size, and color logic everywhere.

## Icons
White outline, ~2px stroke, rounded caps, minimal, construction-specific where possible
(the dashboard set). Do NOT mix filled / thin-line / emoji / generic SaaS icons.

## Imagery — use sparingly
Only: (1) dashboard tiles, (2) module hero headers (heavily darkened/blurred), (3) empty
states, (4) occasional large feature panels. Data-heavy areas stay clean cards + icons +
badges + tables — never full-photo backgrounds.

## Navigation
- Left rail = main navigation (icons).
- Top project pill = project context.
- Right rail = optional module groups / quick jump — make collapsible or
  dashboard-only, so two nav systems don't compete.

## Module targets
### Detailing Control Center → "Drawing & Submittal Control" (a Drawing Release Command Board)
- Hero header: darkened blueprint/steel imagery + white icon + title + subtitle + project
  context + chips (e.g. `13 Sets | 155 Sheets | 72.9% Fab Ready`).
- KPI strip: Drawing Sets · Sets Released · In Review · Submittals · Overdue · Fab Ready
  (icon + label + number + supporting text + status color). Fewer big red boxes up top.
- Main grid: Left 60% **Approval Risk Board** (immediate approval risk, tabs: Due This
  Week / Needs Action / Missing Dates / Sets Released, list of at-risk sets) · Right 40%
  **Next Decision Required** (focus set: sheets, status, owner, required date, impact
  badges, actions: Open Work / Draft RFI / Draft PCO).
### RFI page → "RFI Control Center" (a Question Resolution Center)
- Hero header (construction imagery + white icon + title + subtitle).
- KPI strip: Need Action · Overdue · Incomplete · Critical · Response Rate · Cost
  Exposure · Schedule Impact (fewer, stronger cards).
- Main grid: Left **RFI Work Queue** (clean row cards: RFI #, title, status, ball-in-court,
  age, impact) · Right **Highest-Risk RFIs** (RFI #, title, days late, ball-in-court,
  impact badges, quick action).
- Clean search/filter row + premium row cards / table.

## Keep / Change
KEEP: dark theme · dashboard tile layout · construction imagery · white line icons · gold
accent · project selector · left rail · dense PM data.
CHANGE: reduce terminal feel + all-caps micro-labels · add module hero headers · standardize
KPI cards · every module page follows the standard structure · use risk colors selectively ·
tables → premium work queues · bring the dashboard icon/photo language into each page header.

## Design principles
1. Dark industrial SaaS shell. 2. Construction-first identity. 3. Dashboard as visual
launcher. 4. Modules as focused workbenches. 5. Gold accent for priority + brand.
6. White line icons for consistency. 7. Photoreal imagery used sparingly. 8. Dense data,
organized into clear decision zones.

## Execution sequence
1. **Kit / tokens** (propagates everywhere): align `desktop.css` workbench-card +
   palette + badge vocabulary + button utilities to this brief; de-uppercase `StatTile`
   label; extend `StatusPill` tones. (Launcher tile/dock/canvas tokens stay — the
   dashboard look is approved.)
2. **Detailing workbench**: finish the flagship to the "Drawing & Submittal Control"
   target (hero, KPI strip, Approval Risk Board + Next Decision two-column, de-terminal
   the inner content).
3. **RFI Control Center workbench.**
4. Roll the workbench pattern to remaining modules (Schedule, Change Orders, Budget
   Control, Vendors, Deliveries, …), moat-first.
Each slice: behavior-preserving where logic exists, validated (lint/typecheck/test/build)
+ field-verified, flag-gated under the desktop skin.
