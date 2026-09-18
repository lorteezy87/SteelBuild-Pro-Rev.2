# SteelBuild Pro UI Redesign Wave 3 Implementation Plan

**Goal:** Carry the approved SteelBuild-Pro operating-system UI through Production Status, Procurement, Deliveries, Schedule, and Field without changing the domain authorities that currently own production, procurement, logistics, schedule, or field writes.

**Architecture:** Wave 3 is a presentation/read-model migration. Shared command primitives from Waves 1–2 provide page identity, operational summaries, attention queues, date-risk cells, status/impact badges, and workflow stages. Existing page containers continue to own queries, mutations, permissions, cache invalidation, sequence logic, delivery status transitions, schedule calculations, and field records.

## Global constraints

- Dark and light remain equal first-class themes.
- Brand orange stays an identity/action color; semantic green/amber/red/blue retain workflow meaning.
- Unknown evidence remains unknown. Never turn missing dates, material, load-list, field, or schedule evidence into a green state.
- Preserve current routes, query keys, mutation handlers, RLS assumptions, piece canonicalization, Fab Release authority, and schedule task semantics.
- New source files under `src/` are TypeScript/TSX.
- Desktop remains dense and operational; Field remains touch-friendly and responsive.
- Every migrated page should answer: what exists, what is wrong, who owns it, when it matters, and what happens next.

---

## Task 1 — Production Status: shop execution board

**Primary files**
- `src/pages/productionStatus/ProductionStatusControlCenter.tsx`
- `src/pages/productionStatus/productionStatusControlCenter.derive.ts`
- `src/pages/productionStatus/__tests__/productionStatusControlCenter.derive.test.ts`
- add focused render test if needed.

**Presentation contract**
- Replace PageHero/KpiStrip with PageHeader/OperationalSummary.
- Add an AttentionQueue for past-due ship dates, held/stalled production, and missing drawing linkage when current evidence supports it.
- Keep the canonical production table and bulk-stage controls.
- Table hierarchy prioritizes Piece Mark, WP/sequence, drawing, status/station, quantity/weight where present, ship date, and exception.
- Preserve existing production-stage writes and import flows.

---

## Task 2 — Procurement: material-readiness control

**Primary files**
- `src/pages/procurement/ProcurementControlCenter.tsx`
- `src/pages/procurement/procurementControlCenter.derive.ts`
- `src/pages/procurement/__tests__/procurementControlCenter.derive.test.ts`

**Presentation contract**
- PageHeader/OperationalSummary for open items, overdue need-by, long-lead exposure, shipped/en-route, and received.
- AttentionQueue prioritizes overdue, long-lead slipping, and missing required-date evidence.
- Register centers on item/category, vendor/PO, linked package/sequence if available, need-by, promised/ship date, status, and risk.
- No invented material-ready state.

---

## Task 3 — Deliveries: load-readiness operating board

**Primary files**
- `src/pages/deliveries/DeliveryControlCenter.tsx`
- `src/pages/deliveries/deliveryControlCenter.derive.ts`
- `src/pages/deliveries/components.tsx`
- `src/pages/deliveries/__tests__/deliveryControlCenter.derive.test.ts`
- existing delivery analytics/tests.

**Presentation contract**
- PageHeader/OperationalSummary.
- AttentionQueue for late loads, exceptions, missing dates, and receiving conflicts already represented in delivery signals.
- Load register prioritizes Load, WP/sequence, pieces, tons, fabrication/readiness evidence, carrier, required-on-site date, scheduled ship, status, receiving.
- Retain Register / Dispatch / Schedule views and all receiving actions.
- Existing delivery status remains authoritative; do not create parallel load states.

---

## Task 4 — Schedule: constraint and lookahead workspace

**Primary files**
- `src/pages/schedule/ScheduleCommandCenter.tsx`
- `src/pages/schedule/scheduleCommandCenter.presentation.ts`
- `src/pages/schedule/scheduleCommandCenter.derive.ts`
- `src/pages/schedule/__tests__/ScheduleCommandCenter.test.tsx`
- existing schedule derive/presentation tests.

**Presentation contract**
- Replace hero/KPI chrome with PageHeader/OperationalSummary.
- Preserve Gantt, list, lookahead, WBS, imports, task mutations, parent/child logic, and actuals.
- Add management attention around overdue/near-term tasks, milestones, unassigned work, and existing risk/constraint reasons.
- The schedule page should expose near-term execution without duplicating Command Center's global NOW / 48h / 10d logic.

---

## Task 5 — Field: touch-first daily execution

**Primary files**
- `src/pages/Field.jsx`
- `src/pages/field/FieldDashboardSections.tsx`
- `src/pages/field/fieldDashboardDerive.ts`
- `src/pages/field/__tests__/fieldDashboardDerive.test.ts`

**Presentation contract**
- Preserve fast capture for daily log, photos, punch, safety, and receiving.
- Recompose top of page around today: crew/hours, loads, open punch/safety/inspection, and current field action feed.
- Keep large touch targets and existing routes.
- Clearly distinguish missing daily-log evidence from zero crew/hours.
- Do not infer material-on-site or erection readiness unless existing data supports it.

---

## Task 6 — Wave 3 verification

- Focused tests for all five surfaces.
- Dark / light / high-contrast review.
- Compact vs comfortable density where supported.
- Keyboard navigation on desktop registers.
- Mobile/tablet Field and delivery checks.
- `npm run lint`
- `npm run check:no-new-js`
- `npm run typecheck`
- `npm run typecheck:js`
- `npm run typecheck:strict`
- `npm run typecheck:noimplicitany`
- `npm test`
- `npm run build`
- Confirm GitHub CI green before calling Wave 3 complete.
