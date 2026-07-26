# Standard mutation toast adoption (ID 48)

**Status:** Done (helper established + flagship surfaces) — 2026-07-26  
**Helper:** `toUserErrorMessage` in `src/lib/mutations/standardMutation.ts`

## Adopted (representative)

Schedule, Drawings/Submittals hooks, Financials cost-code CRUD, Projects, Constraints, Action Items, Deliveries, commercial/ops pages from #133–#150, Contacts/DMS, RFIs (`formatRfiNotifyError` / `toastCrudError`).

## Residual (adopt when touching the file)

| Area | Notes |
|---|---|
| DrawingViewer / SignoffStampPanel / auto-scale | Viewer-local |
| Collaboration CommentThread | Shared chrome |
| InlineEditField / UserEditModal | Shared chrome |
| Punchlist / TeamWorkflowSection | Page-local leftovers |
| LaborDrawer | Financial drawer |

New mutation error toasts should call `toUserErrorMessage(err, fallback)` (or domain wrappers that do). Do not reopen this ID solely for residual viewer/chrome call sites.
