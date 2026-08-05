# Dead-code lean-out — 2026-07-27

**Branch:** `cursor/dead-code-lean-2696`  
**Method:** knip unused-files report + import-graph verification + route registry check. Only deleted modules with zero production imports (tests retargeted where coverage still matters).

## Removed (confirmed unused)

### Shims / auth orphans
- `src/pages.config.js` (deprecated; `src/config/routes.js` is SoT)
- `LocalLoginForm.jsx`, `UserNotRegisteredError.jsx` (AuthenticatedApp uses Landing/MFA/OrgOnboarding)

### Legacy Doc Control implementations
- `DrawingRegisterGrid.tsx`, `ReviewQueue.tsx`, `TransmittalLog.tsx`, `ImpactBoard.tsx` re-export  
- Release-affordance test retargeted to `DrawingRegisterGridPanel`

### Replaced dashboard stack
- Entire `src/components/dashboard/*` except `TrueHealthChart.jsx` (ExecutiveView)
- Orphan `ProjectDashboard.jsx` + AgingCard / QuickUpdateRail / DashboardHeader / FinancialSnapshot + section panels (kept `projectMetrics.js`, `dashboardTheme.css`, `sections/SectionCard.jsx`)
- `GettingStartedChecklist.tsx` + `useGettingStarted.ts` (unwired; pure `lib/gettingStarted` retained)

### Orphan feature UI
- commandcenter widgets except `ItemDetailDrawer` / `ForwardLookDrawer`
- Unused list/modals: ActionItemList, RFIDashboard/List, DeliveriesList, daily-log modals, production-note list/modal, DMS left panel / linked-folder browser / dmsConstants, financial chart cards, schedule CalendarView/Timeline/criticalPath/ganttSeed, GanttContextMenu, drawings BulkActionBar/RevisionHistoryPanel/StagePipeline, CostCodeSelect, Breadcrumbs, FileUploadWithOCR, DeckJoist*, ProjectKickoffChecklist, PlanningStudio, ResourceList
- Shared dead widgets: QuickAddFAB, theme guide JSX, WorkflowBlockingModal/StepIndicator, Loader/PageHeader/SearchFilter/charts/gauges/etc. unused outside deleted trees

### Dependencies
- `@hello-pangea/dnd` (zero imports)

## Intentionally kept
- `lib/gettingStarted` + unit tests (pure checklist logic)
- `pages/dashboard/projectMetrics.js` (reports + control-center derive)
- Number-sequence / LLM paths in `functions.ts` (public barrel compatibility)
- Stripe client packages (billing path may adopt; edge billing remains authoritative)
- Unused shadcn/radix wrappers under `src/components/ui` (compat surface; follow-up)

## Follow-up (needs review)
1. Sweep remaining unused `src/components/ui/*` + matching radix packages once no dynamic imports remain.
2. Consider re-wiring Getting Started checklist into Dashboard Control Center if product still wants onboarding (logic lives in `lib/gettingStarted`).
3. `@stripe/react-stripe-js` / `@stripe/stripe-js` unused in app code today — remove only after Billing UI decision.
