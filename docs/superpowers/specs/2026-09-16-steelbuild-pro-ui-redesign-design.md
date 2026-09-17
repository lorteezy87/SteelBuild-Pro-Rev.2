# SteelBuild Pro UI Redesign — Design Specification

**Date:** 2026-09-16  
**Repository:** `lorteezy87/SteelBuild-Pro-Rev.2`  
**Scope:** System-first UI/UX redesign of the existing product.  
**Design direction:** Professional structural-steel operating system with equal-quality dark and light themes, built around the approved SteelBuild-Pro logo identity and a charcoal / steel / orange visual language.

## 1. Purpose

SteelBuild Pro already has substantial production logic, control-center pages, dual-theme infrastructure, typed derivation layers, Supabase-backed workflows, responsive navigation, and a growing shared command UI kit. The redesign must strengthen the product identity and day-to-day usability without rewriting stable business rules or database behavior.

The redesigned product must feel purpose-built for structural steel project management. The interface should prioritize production control, approvals, work-package readiness, piece status, deliveries, field readiness, schedule risk, and commercial exposure. It must not resemble a generic admin template or a collection of independent SaaS modules.

The central operating principle is:

> Every important screen should tell the user what exists, what is wrong, who owns it, when it matters, and what happens next.

## 2. Goals

1. Create a coherent SteelBuild-Pro product identity across the full application.
2. Give dark and light themes equal visual emphasis and equivalent hierarchy.
3. Simplify the application shell and navigation while preserving underlying routes and deep links.
4. Make the Dashboard and Command Center operationally useful rather than primarily navigational.
5. Standardize page structure, tables, statuses, filters, detail views, and object metadata across modules.
6. Increase information density where construction PM work benefits from it, especially on desktop.
7. Make structural-steel workflows visually explicit: RFI → approval → IFC → release → fabrication → load → ship → erect → commercial closeout.
8. Preserve stable data logic, Supabase contracts, RLS, permission boundaries, workflow engines, release gates, scoring engines, and canonical piece logic.
9. Build the redesign on the existing token and `@/components/command` foundations instead of introducing a parallel design system.
10. Maintain accessibility, compact-density behavior, responsive operation, and high-contrast support.

## 3. Non-goals

This redesign does **not** include:

- replacing Supabase;
- changing organization boundaries or RLS behavior;
- changing official record-number sequencing;
- redesigning database schema merely for visual consistency;
- rewriting stable workflow or schedule engines;
- consolidating routes solely to reduce route count;
- replacing dense registers with card-only interfaces;
- making mobile dictate desktop density;
- introducing decorative steel textures, diamond plate, excessive metallic effects, heavy glow, or gratuitous glassmorphism;
- converting every existing JSX file to TypeScript simply because it is touched visually;
- adding new production claims when the underlying data is absent or unknown.

## 4. Product personality

SteelBuild Pro should read as a professional construction operating system rather than a lifestyle SaaS product.

The visual character is:

- precise;
- industrial without being themed or gimmicky;
- information-dense;
- calm under high data volume;
- direct about risk and ownership;
- suitable for project managers, detailers, fabricators, logistics coordinators, field leaders, and commercial teams;
- recognizably specific to structural steel.

The industrial character comes from proportion, linework, typography, steel-neutral colors, dense tables, consistent hierarchy, operational terminology, and the approved SB/SteelBuild-Pro identity — not from simulated metal textures in the application UI.

## 5. Brand system

### 5.1 Logo usage

The approved SteelBuild-Pro logo reference establishes the product identity: an SB structural-steel emblem, SteelBuild-Pro wordmark, orange accent, and the tagline **BUILT FOR WHAT YOU BUILD**.

Application-ready variants must be derived from that identity:

- **Full horizontal mark** — expanded sidebar, authentication, selected brand surfaces.
- **Compact SB mark** — collapsed navigation, mobile header, favicon/app icon.
- **Flat two-color mark** — primary in-app use.
- **Monochrome light mark** — dark/print contexts where two-color branding is inappropriate.
- **Monochrome dark mark** — light/print contexts where two-color branding is inappropriate.

The dimensional metallic wall-render treatment is a brand/marketing presentation style. The core application uses a flatter, simpler mark that remains legible between approximately 24 px and 40 px.

### 5.2 Brand accent

Use a single primary SteelBuild orange:

- `--brand-orange: #FF5A1F`

Orange communicates product identity and primary action. It must not replace semantic state colors.

Orange is appropriate for:

- primary actions;
- active navigation location;
- selected workflow controls;
- current-action emphasis;
- brand dividers and very restrained highlights.

Orange is **not** the default color for:

- error;
- delay;
- fabrication status;
- approved/completed status;
- warning;
- info;
- every clickable element.

Semantic colors remain independent.

## 6. Theme system

Dark and light are first-class themes. Components are not complete until both have been designed and tested.

### 6.1 Dark theme

Core palette:

- canvas / base: `#0C0F12`
- shell / sidebar: `#101418`
- primary surface: `#171C21`
- elevated surface: `#1E252B`
- strong steel surface: `#273039`
- border: `#303942`
- primary text: `#F2F4F5`
- secondary text: `#A7B0B8`
- brand orange: `#FF5A1F`

These values become CSS tokens in `src/styles/tokens.css`. Components consume variables only; they do not hardcode theme surface/text/border hex values.

### 6.2 Light theme

Core palette:

- canvas / base: `#F2F4F5`
- shell / sidebar: `#FFFFFF`
- primary surface: `#FFFFFF`
- secondary surface: `#E9EDF0`
- strong steel surface: `#DCE1E5`
- border: `#CCD2D7`
- primary text: `#181C20`
- secondary text: `#606A73`
- brand orange: `#FF5A1F`

Light mode is not an inverted dark theme. It uses the same hierarchy, geometry, spacing, component structure, and brand language with light-appropriate surface depth and contrast.

### 6.3 High contrast and density

Existing high-contrast, font-scale, motion, and density preferences remain supported. Shared components must be validated in:

- dark;
- light;
- high contrast;
- compact density.

High contrast may remap text and border tokens as it does today; the redesign must not remove that mechanism.

## 7. Typography

Retain the repository's established font families:

- **Barlow Condensed** — display titles, high-value operational figures, compact section identity where appropriate.
- **Inter** — body text, controls, tables, forms, navigation.
- **IBM Plex Mono** — piece marks, numbers, tonnage, dates where alignment matters, codes, IDs, compact metadata.

Typography rules:

- avoid oversized SaaS-style headings;
- prioritize readable desktop density;
- use tabular numerals for dollars, tons, hours, percentages, dates, and piece counts;
- use uppercase metadata labels selectively, not universally;
- distinguish identity, operational status, and descriptive text through scale and weight rather than through decorative containers.

## 8. Geometry and surfaces

The application should reduce generic floating-card styling.

### 8.1 Primary work surfaces

- 6–8 px radius;
- thin steel-neutral border;
- little or no shadow;
- strong internal dividers;
- consistent column alignment;
- compact internal spacing compared with current marketing-style panels.

### 8.2 Utility panels

- visually attached to the working surface;
- slightly different surface level from the page canvas;
- compact headers;
- no decorative glass effect by default.

### 8.3 Critical panels

Use a narrow edge marker, icon, or status strip rather than glowing borders.

- orange: actionable SteelBuild workflow emphasis;
- red: genuine block/error/risk;
- amber: warning/watch;
- green: complete/approved/healthy;
- blue: informational or selected non-brand status.

## 9. Shared interaction hierarchy

### 9.1 Buttons

**Primary**  
Solid SteelBuild orange. Use for the principal action on a surface such as Create RFI, Release to Fab, Create COR, or Add Work Package.

**Secondary**  
Steel-neutral outlined or filled control.

**Utility**  
Minimal icon/text treatment with hover/focus chrome only.

**Destructive**  
Red semantic treatment. Never use brand orange to indicate destruction.

### 9.2 Status language

Each workflow state has one canonical label and consistent tone everywhere.

Drawing approval lifecycle:

`IFA → OFA → BFA → OFS → IFC → Released`

Piece / production lifecycle:

`Not Started → Released → In Fabrication → Fabricated → Shipped → Erected`

The redesign must not create alternate labels that conflict with existing workflow rules.

## 10. Application shell and navigation

### 10.1 Primary navigation hierarchy

Reorganize visible navigation into seven primary operational groups while keeping the underlying route contracts stable:

1. **Command** — Dashboard, Command Center, Alerts.
2. **Projects** — Projects, Scope, Contacts, project setup.
3. **Detailing** — Drawing Control, Submittals, RFIs, Documents.
4. **Production** — Work Packages, Piece Register, Fab Release, Production Status, Procurement, Deliveries.
5. **Field** — Field Today, Field Hub, Daily Logs, Inspections, Safety, Quality Control.
6. **Commercial** — Budget, Change Orders, SOV, Pay Applications, Backcharges.
7. **Reports** — Portfolio, Job Status, Reports, Activity.

Administration and tools move to a lower utility section so they do not compete visually with daily project workflows.

### 10.2 Sidebar

Expanded desktop sidebar:

- full SteelBuild-Pro wordmark at top;
- primary operational groups;
- restrained active-location orange treatment;
- utility area at bottom for Settings, Administration, tools, and user actions.

Collapsed sidebar:

- SB emblem only;
- icons with accessible labels/tooltips;
- current location remains visually clear.

### 10.3 Top project context bar

A permanent project context bar spans the main work area and includes:

- active project name;
- optional project number when user preference allows it;
- current phase/state where available;
- project switcher;
- global search;
- alerts;
- theme / accessibility controls;
- user menu.

Page-specific actions do not live in the global shell.

### 10.4 Responsive behavior

- Desktop: full sidebar by default.
- Tablet: icon rail by default with access to full navigation.
- Phone: existing drawer concept retained and restyled.
- Field-specific phone/tablet screens may use larger touch targets and simplified layouts while preserving the same product identity.

## 11. Page architecture

Every major project module uses the same basic page hierarchy:

1. project/module context;
2. strong title;
3. compact operational summary;
4. local module navigation/tabs where needed;
5. primary action area;
6. filters/search;
7. main work surface;
8. optional contextual detail rail or drawer.

Example:

`BIMC ED Expansion / Fabrication Control`

Summary:

`18 work packages · 327 pcs · 94.6 tons · 71% fabricated · 2 release blockers`

This replaces unrelated page-specific header patterns with a coherent application grammar.

## 12. Object detail architecture

Important objects — RFI, submittal, drawing set, work package, delivery, change order, piece context — use a common information hierarchy:

1. **Identity**
2. **Status**
3. **Responsibility / ball in court**
4. **Dates / required-by**
5. **Impact**
6. **Relationships**
7. **Activity / history**

Common operational metadata becomes consistently visible:

- `STATUS`
- `BALL IN COURT`
- `REQUIRED BY`
- `IMPACT`
- `LINKED OBJECTS`
- `NEXT ACTION`

## 13. Dashboard redesign

The Dashboard answers:

1. What is happening?
2. What is at risk?
3. What needs management attention?

### 13.1 Dashboard header

Show:

- project identity;
- project number if enabled;
- GC / primary external partner when data exists;
- project phase;
- key milestone when available;
- compact project-health summary.

Do not invent values for missing project data.

### 13.2 Operational metric strip

Use compact instrument-style metrics rather than oversized cards. Suggested metrics include:

- Open RFIs;
- Pending approvals;
- Fabrication progress;
- Next delivery;
- CO exposure;
- Schedule variance / schedule health;
- Field readiness.

Each displayed metric must be based on loaded evidence. Unknown values remain unknown.

### 13.3 Needs Attention

A first-class management queue replaces the current emphasis on module-launcher tiles.

Each item shows:

`ISSUE · DEADLINE · RISK · BALL IN COURT · NEXT ACTION`

Examples include:

- aging RFI;
- BFA package blocking fabrication;
- load missing verified piece/list readiness;
- work package approaching release without IFC coverage;
- field sequence without complete material;
- directed change work with incomplete commercial documentation.

### 13.4 Operational bands

The central Dashboard uses four steel-specific bands:

- **Approvals & Engineering**
- **Fabrication & Logistics**
- **Field Readiness**
- **Commercial Exposure**

Each band summarizes current condition and exposes the few records needing action.

The existing photographic module grid is demoted to compact Quick Access or removed when redundant with navigation.

## 14. Command Center redesign

The Command Center is tactical. Its job is to answer what must be managed now.

Primary horizons:

- **NOW**
- **48 HOURS**
- **10 DAYS**

### 14.1 NOW

Surface overdue approvals, active field stoppages, missed releases, late material, active schedule threats, and decisions that need immediate ownership.

### 14.2 48 Hour Gate

Surface upcoming:

- loads;
- piece/sequence completeness;
- verified load lists;
- fabrication starts/releases;
- drawing/IFC readiness;
- field readiness;
- critical dimensions/VIFs;
- procurement constraints;
- owner.

### 14.3 10 Day Lookahead

Show what is expected to:

- fabricate;
- ship;
- erect.

For each at-risk item, show blocker, owner, and action required today.

Below the horizons, provide focused queues for approvals, production, and commercial exposure.

## 15. Tables and registers

Dense registers are a core SteelBuild interaction, not a fallback.

Table system requirements:

- persistent column hierarchy;
- stronger header treatment;
- sticky/frozen identifiers where useful;
- compact and comfortable density modes;
- tabular numbers;
- numeric alignment;
- subtle row hover;
- restrained alternate-row treatment if needed;
- narrow status indicator treatment;
- contextual bulk action bar;
- consistent filter/search toolbar;
- visible active filters;
- saved views where the module benefits from them;
- horizontal scrolling only for genuinely wide operational data.

## 16. RFI UX

Default register columns:

`RFI # | Subject | Sent | Days Open | Required By | Ball in Court | Impact | Linked WP | Status`

Primary filtering must make it easy to identify:

- overdue;
- due within three days;
- blocking detailing;
- blocking fab/release;
- field-impacting;
- unanswered external items;
- answered RFIs with unfinished downstream work.

RFI detail uses a two-column layout:

**Main** — question, response, attachments, drawings, correspondence.  
**Operational rail** — status, ball in court, sent/received dates, required-by, linked work packages, affected drawings, cost exposure, schedule impact, downstream action.

An answered RFI is not automatically visually treated as operationally complete.

## 17. Detailing and submittal UX

The Detailing Control Center is organized around the canonical approval lifecycle:

`IFA → OFA → BFA → OFS → IFC → Released`

Each drawing package is represented as a horizontal lifecycle row emphasizing:

- current stage;
- current owner;
- production-required date;
- unresolved comments;
- release readiness.

Add a **Production Readiness Queue** with:

`Package | Current Stage | Required IFC | Fab Start | Float | Blocker`

Drawing-set details combine:

- sheet register;
- revision history;
- approval status;
- comments;
- related RFIs;
- work-package links;
- piece links;
- release eligibility;
- transmission history.

Submittals remain the workflow source of truth. Set-per-revision behavior remains unchanged.

## 18. Work Package and Fab Release UX

Primary Work Package register:

`WP | Description | Sequence | Tons | Pieces | Drawing Status | Material | Fab | Ship | Field | Risk`

Work Package detail sections:

1. Scope
2. Release Gate
3. Production
4. Logistics
5. Field

Blocked release must state the concrete reason, for example:

`RELEASE BLOCKED — 2 IFC sheets missing · RFI 018 unresolved`

The UI must consume existing validators and release-gate logic rather than duplicating weaker checks.

## 19. Piece Register UX

The canonical Piece Register remains the authoritative piece-control UI.

Primary columns:

`Piece Mark | Qty | Main Mark | Shape | Weight | WP | Sequence | Drawing | Release | Fab | Load | Ship | Erect`

Core interactions:

- sticky identifiers;
- fast column filters;
- saved views;
- bulk selection;
- action bar only when selection exists;
- grouping by work package, sequence, drawing set, or status;
- expandable lots/splits;
- obvious distinction between canonical pieces and split/container records.

Existing `selectActionableLeafPieces` and canonical lifecycle rules remain authoritative for rollups.

## 20. Deliveries UX

The Deliveries module is organized around load readiness.

Primary register:

`Load | WP / Seq | Pieces | Tons | Fab Complete | Load List | Carrier | Required On Site | Status`

Canonical visible delivery states:

`PLANNED → READY TO LOAD → LOADING → IN TRANSIT → DELIVERED → RECEIVED`

The UI must not visually treat a scheduled load as ready when required pieces or required documentation are incomplete.

Load detail includes piece roster, total weight, fabrication completeness, missing pieces, shipping list, carrier/trailer, requested date, ship date, actual departure, received status, acknowledgement, and related photos/documents where available.

## 21. Field UX

Field-facing views prioritize touch usability and immediate execution information.

Field Today answers:

- What are we erecting today?
- What material is here?
- What is missing?
- What is blocking the crew?

Priority content:

- sequence/area;
- planned picks;
- delivered pieces;
- missing pieces;
- active holds;
- required inspections;
- crane/equipment notes;
- manpower;
- immediate RFIs/constraints.

Field issue capture should support a fast structured evidence workflow containing, where applicable:

- photo;
- piece mark;
- issue;
- direction received;
- person who directed the work;
- labor hours;
- equipment impact.

This structured evidence feeds change-order support without making unsupported commercial claims automatically.

## 22. Commercial UX

The commercial workflow is modeled visually as:

`Change Event → COR → Approved CO`

Primary register:

`CE / COR | Description | Source | Cost | Sell | Status | Aging | Directed By | Evidence | Billing`

The interface must distinguish:

- work identified;
- work directed;
- cost captured;
- COR submitted;
- COR approved;
- billed.

Change-event evidence can link to:

- RFI;
- email;
- drawing revision;
- piece marks;
- labor;
- equipment;
- material;
- freight;
- photos;
- superintendent/GC direction.

Evidence completeness may be represented only when derived from explicit evidence criteria. It must identify missing supporting categories rather than presenting unsupported certainty.

CO detail should show actual captured cost versus submitted/approved value where the required cost data exists.

## 23. Shared component architecture

The redesign extends the existing command UI rather than replacing it.

Base shared primitives should converge toward:

- `AppShell`
- `ProjectContextBar`
- `ModuleNav`
- `PageHeader`
- `OperationalSummary`
- `MetricCell`
- `AttentionQueue`
- `WorkflowStage`
- `StatusBadge`
- `ImpactBadge`
- `OwnerCell`
- `DateRiskCell`
- `FilterToolbar`
- `SteelTable`
- `BulkActionBar`
- `DetailRail`
- `RelationshipPanel`
- `ActivityTimeline`
- `EmptyState`

Construction-domain components should sit above those primitives:

- `ApprovalLifecycle`
- `ReleaseGate`
- `WorkPackageReadiness`
- `LoadReadiness`
- `PieceStatusMatrix`
- `ChangeEvidenceScore`
- `LookaheadGate`

Domain-specific components may consume shared primitives; shared primitives must not encode structural-steel business rules they do not own.

## 24. Existing code that should remain authoritative

The redesign preserves existing behavior in these areas unless a separate approved functional change explicitly targets them:

- Supabase schema and RLS;
- organization/workspace boundaries;
- permission rules;
- `get_next_sequence_number` official numbering;
- schedule status/percent reconciliation;
- schedule date/duration helpers;
- project-control scoring boundaries;
- submittal-as-source-of-truth stage semantics;
- fab release validation;
- linked-RFI normalization;
- model-roster pagination/lazy-load rules;
- piece canonical-selection and lot/split handling;
- existing mutation pathways and server-side RPC ownership.

The UI must call existing validators and domain helpers rather than reproducing weaker logic in presentation code.

## 25. TypeScript standard

All newly created source files must be `.ts` / `.tsx`.

Existing `.js` / `.jsx` files may be edited in place. They should be converted only when conversion provides a concrete implementation benefit, not as a bulk redesign activity.

## 26. Implementation waves

### Wave 0 — Foundation

- app-ready logo assets;
- tokens and theme remap;
- typography/spacing/radius/shadow normalization;
- shared status/button/table/filter primitives;
- dark/light/high-contrast parity tests;
- shell/nav design-system groundwork.

### Wave 1 — Shell + reference experiences

- application shell;
- sidebar and project context bar;
- Dashboard;
- Command Center;
- reference shared tables/queues.

This establishes the canonical UI language before broad rollout.

### Wave 2 — Core approval / production chain

- RFIs;
- Detailing/Submittals;
- Work Packages;
- Piece Register;
- Fab Release.

### Wave 3 — Fabrication-to-field chain

- Production Status;
- Procurement;
- Deliveries;
- Schedule;
- Field Today / Field Hub.

### Wave 4 — Commercial chain

- Cost;
- Change Orders;
- Backcharges;
- SOV;
- Pay Applications.

### Wave 5 — Supporting surfaces

- Portfolio;
- Reports;
- Documents;
- Administration;
- utilities/tools;
- secondary settings surfaces.

## 27. Testing and acceptance gates

Each migrated major module must preserve behavior and pass relevant existing tests.

Required repository gates before a redesign slice is considered complete:

- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:js`
- `npm run typecheck:strict`
- `npm run typecheck:noimplicitany`
- `npm run check:no-new-js`
- `npm test`
- `npm run build`

For UI slices, also validate:

- dark theme;
- light theme;
- high-contrast mode;
- compact density;
- keyboard focus states;
- responsive tablet behavior;
- relevant mobile behavior;
- no false-success messaging;
- no affirmative claim from absent/unknown data.

P0 workflows, including fab-release gating, must remain green.

## 28. Migration strategy

The redesign should be incremental and reversible by slice.

For each module:

1. document current behavior and required actions;
2. identify existing derivation/business-rule boundaries;
3. preserve the data interface;
4. move presentation onto shared SteelBuild primitives;
5. add or update focused component/derive tests;
6. verify both themes and density modes;
7. run repository gates;
8. commit the slice independently.

Large components should be thinned only when necessary for the redesign. Pure derivation/business logic should be extracted into typed helper modules with tests; unrelated refactors are out of scope.

## 29. Success criteria

The redesign is successful when:

- the app is recognizably SteelBuild-Pro in both dark and light themes;
- a user can identify project context and current location without relying on page-specific styling;
- Dashboard emphasizes operational condition and management attention over module discovery;
- Command Center provides clear NOW / 48 HOURS / 10 DAYS control horizons;
- RFI, detailing, fabrication, logistics, field, and commercial modules share a coherent page grammar;
- tables support dense professional work rather than being replaced by card grids;
- status, ownership, deadline, impact, linked objects, and next action are consistently exposed;
- orange is used as brand/action emphasis without replacing semantic state colors;
- production and release claims continue to use existing authoritative business logic;
- dark and light are equivalent products rather than primary and fallback themes;
- CI gates remain green throughout staged rollout.

## 30. Final design principle

At a glance, SteelBuild-Pro should be identifiable by its steel-neutral shell and orange brand system.

At working distance, it should be unmistakably structural-steel software through its language and data hierarchy: drawing stages, RFIs, work packages, piece marks, tons, fabrication, loads, shipping, erection, field readiness, and commercial exposure.

During active use, every major surface should make five things easy to answer:

1. What needs attention?
2. What is blocking production?
3. Who owns it?
4. When is it required?
5. What happens next?
