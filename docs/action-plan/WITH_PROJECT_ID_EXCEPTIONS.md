# `withProjectId` exception list (ID 50)

**Status:** Done (exception-list acceptance) — 2026-07-26 closeout sweep  
**Helpers:** `assertProjectId` / `withProjectId` in `src/lib/mutations/standardMutation.ts`

## Intentionally out of scope (org-level / portfolio)

These creates are **not** project-scoped and must not force `project_id` from the active project pill:

| Surface | Entity | Why |
|---|---|---|
| `Projects.jsx` | `Project` | Org workspace create |
| `Vendors.jsx` | `Vendor` | Org-level vendor directory |
| Contacts portfolio create (no project selected) | `Contact` | May be org directory; when project-scoped, page stamps via helper |
| Organization / membership admin | `Organization`, members | Tenant boundary, not project |

## Project-scoped paths expected to use `withProjectId` / helpers

Flagship + ops pages wired in #119–#150 and this closeout:

- RFIs, Drawings, Submittals (page helpers + `useDrawings` / `useSubmittals`)
- Constraints, Action Items, Deliveries, Schedule tasks
- Inspections, Production Notes, Procurement, Look-ahead, Alerts, LEMs
- Email account / Doc Control review queue / Transmittals
- DMS Document + LinkedFolder create
- Fab Release work packages, SOV import, Pay Apps, Backcharges, T&M, Expenses, Contract Management

## Residual risk (keep watching)

- Large upload / import pipelines that create child rows in loops — prefer stamping once at the orchestration boundary.
- Modals that accept an explicit `projectId` prop (multi-project workspace) may call `withProjectId(data, data.project_id)` (e.g. Production Notes).

New project-scoped `entities.*.create` call sites should use `withProjectId` or a domain `build*CreatePayload` helper. Do not mark this ID Incomplete solely because org-level pages omit project stamping.
