# SteelBuild Pro full-app rebuild inventory

Read-only source inventory, 2026-10-07. This is a module map and rebuild-scope assessment, not a deployed-readiness certification.

This inventory is frozen at the preceding `1bea4b3d` checkpoint. Subsequent
cross-module repairs are recorded separately in
[the core workflow continuation](FULL_APP_CORE_WORKFLOWS_2026-10-07.md).

## Snapshot and comparison

- Audited checkout: `SteelBuild-Pro-Rev.2`.
- Clean branch: `codex/steel-executive-hardening`; HEAD `1bea4b3d523f3720020cc1f43ac8f243b46bd7d6`.
- Exact comparison base / merge base with `origin/main`: `948c7de7342539a95450d1c014c9991e88ba9be0`.
- An independent archive/blob comparison confirmed that all 2,907 regular files in `10.7.26.zip` byte-match that base, with 2,815 unchanged / 92 changed / 70 branch-only files against HEAD. The comparison inspected archive bytes without extracting or executing its contents; the archive has no unsafe paths.
- Source of truth: `src/config/routes.js` contains **78 registered pages: 73 active and five internal**. `src/pages/reports/registry.js` adds **38 nested report destinations**. Neither registry nor `src/config/moduleRegistry.js` changed on this branch.
- “Untouched” below means no direct source change in that module relative to the base. Shared authentication, data-client, cache, theme, cost-helper and replay changes can still affect it. It does not mean tested, complete or broken.

## Complete product map

Every registered page is listed once below. Route names are exact; prepend `/` to open their registered URL. An asterisk marks an internal route, not a normal customer navigation destination.

| Steel business area | Registered pages | Existing source responsibility and branch coverage |
|---|---|---|
| Projects, company administration and daily command | `Dashboard`, `CommandCenter`, `Projects`, `ProjectsHub`, `Onboarding`, `Contacts`, `OrgMembers`, `Settings`, `Billing`, `UsersManagement`*, `ProjectMembers`*, `FeatureFlagsAdmin`*, `DesktopConnect`*, `Tutorial`, `Notes`, `ActionItems` | Project setup, company/team context, permissions, subscriptions, settings, notes, actions and daily job review. **Changed:** dashboard/command presentation, derived counts, navigation, full selected-project reads; Notes ownership; shared workspace/project selection, auth/MFA, cache clearing and local action history. **Untouched direct module source:** project setup/editing, contacts, team/member editors, settings, subscription UI, onboarding/help and ActionItems. `Billing` Edge handler gained the shared MFA guard, but this is not a billing-workflow rebuild. |
| Estimating foundations and commercial control | `ScopeExclusions`, `Vendors`, `CostHub`, `ChangeOrders`, `Backcharges`, `SOV`, `PayApplications`, `Expenses`, `ContractManagement`, `ChangeRequests`, `BudgetHours` | Contract scope/exclusions, vendors, cost codes/budgets/actuals/commitments, changes, claims/defense, billing and shop/field labor budgets. **Changed:** PayApplications single-project query selector; shared cost exposure/revised-budget arithmetic; earned-value helpers and downstream financial scorecard readers. **Untouched direct workflow source:** scope/vendor management, CostHub UI, CO/backcharge creation/approval, SOV, expenses, contract/change-request editors and BudgetHours. **No dedicated registered bid pipeline, estimate/takeoff, quote-management or payroll route.** Budget and procurement cost fields are adjacent capabilities, not evidence of a complete preconstruction estimating system. |
| Drawings, engineering approvals and correspondence | `RFIs`, `DrawingSubmittalHub`, `DrawingViewer`, `Documents`, `Submittals`, `DocumentControl`, `GcDocuments`, `GcDrawingViewer`, `EmailInbox` | Shop drawing sets/sheets, revisions and comparison reports, submittal ownership/approval, RFI responses, controlled documents and separate GC-issued revisions. **Changed:** RFI create/numbering project-scope validation; drawing-register Locked badge appearance; shared detail drawer; email-send MFA guard. **Untouched direct core source:** drawing upload/revision/approval engines, submittal transitions, drawing viewers, GC documents, document control, email intake/classification and inbox UI. Drawing register tests were adjusted/expanded, not an end-to-end redesign. |
| Fabrication, pieces, material procurement and release | `WorkPackages`, `Constraints`, `PieceRegister`, `FabRelease`, `ProductionStatus`, `Procurement` | Work packages, governing drawing links, leaf piece/lot lifecycle, stations, holds, material requirements, production status, release gates and procurement pipeline. **Changed:** indexed canonical piece/station/work-package rollups, preserving leaf-piece and completion deduplication rules. **Untouched direct operational source:** work-package/piece editing and imports, station/release RPC flows, constraint module, fabrication-release UI, production UI and procurement. Procurement tracks category-tagged deliveries through quoted/PO-issued/received stages; it is not evidence of a separate purchasing ledger or warehouse inventory module. |
| Scheduling, labor/equipment planning and logistics | `ScheduleHub`, `ProjectCalendar`, `FieldPlan`, `ResourceHub`, `ResourceScheduling`, `LookAheadSchedule`, `Deliveries` | Gantt tasks/dependencies/baselines, lookahead, multi-entity calendar, field plan, crews/resources and steel deliveries. `ScheduleHub` contains schedule/lookahead/calendar tabs while their existing surfaces remain independently reachable. **Untouched direct source:** every listed module and the schedule import/dependency engines. Shared complete-command reads and field replay were improved, but the planning and logistics workflows themselves were not rebuilt. |
| Field execution, safety/quality and closeout | `FieldToday`, `FieldHub`, `Field`, `DailyLogs`, `Photos`, `LEMs`, `Inspections`, `Safety`, `Punchlist`, `QualityControl`, `ProductionNotes`, `ProjectCloseout`, `Warranty`, `CalculatorsHub`, `Calculator`, `FeetInchesCalculator`, `SteelWeightCalculator`, `CranePickCalculator`, `DecimalFractionConverter` | Foreman daily work, daily logs/photos, labor-equipment-material views, installation progress, inspections/QC, incident records, punch completion, closeout/warranty and trade calculators. `FieldHub` embeds Today/overview/dailylogs/photos/LEMs/inspections/punchlist/quality/safety. **Changed:** shared offline outbox identity, cancellation, replay transport, upload retry checks and photo/progress replay. **Untouched direct screens/forms:** all listed field, safety, QC, closeout and calculator pages. Daily-log source is `src/pages/DailyLogs.jsx` plus `src/components/fieldops/{DailyLogForm,DailyLogsList}.jsx`; these were not redesigned. LEMs derives labor/equipment/material views from work packages, daily logs and deliveries; it is not a payroll system. |
| Portfolio reporting, risk, audit and integrations | `ExecutiveView`, `PortfolioHub`, `RiskHub`, `AlertsCenter`, `JobStatusReport`, `ReportsHub`, `Reports`, `Activity`, `Integrations`, `DataExchange`* | Portfolio management, risk/alerts, job status, financial/operational reports, activity and external connections. **Changed:** ExecutiveView and PortfolioHub workspace-scoped complete reads/error states; financial KPI/scorecard source and arithmetic; shared cost/earned-value consumers; MFA on export/read/handoff/gateway handlers. **Untouched direct source:** RiskHub, AlertsCenter, job status, ReportsHub/Reports registries, the other 36 report components, Activity, Integrations catalog and DataExchange. Catalog labels explicitly distinguish available/manual, setup-required and coming-soon connections. |

Count check: 16 + 11 + 9 + 6 + 7 + 19 + 10 = 78 registered pages.

## Nested reports and public/support surfaces

`/Reports/:slug` is backed by 38 entries in `src/pages/reports/registry.js`:

| Category | Exact slugs |
|---|---|
| Portfolio (7) | `portfolio-overview`, `portfolio-tracker`, `project-status`, `project-details`, `projects`, `projects-health`, `rag` |
| Risk (4) | `risks`, `risks-dashboard`, `risk-status`, `top-risks` |
| Schedule (12) | `project-status-gantt`, `upcoming-milestones`, `tasks-due-this-week`, `schedule`, `project-milestones`, `tasks`, `tasks-completed`, `tasks-status`, `task-board`, `timeline`, `roadmap`, `ppm-roadmap` |
| Financial (2) | `financial-kpis`, `financial-scorecard` — both directly modified on this branch |
| Cost (8) | `profit`, `revenue-dashboard`, `revenue`, `revenue-by-client`, `revenue-by-type`, `revenue-forecast`, `unbilled-revenue`, `weekly-cost-categories` |
| Team (5) | `team-dashboard`, `whos-doing-what`, `workload`, `weekly-status-reports`, `upcoming-key-activities` |

Outside the 78-page registry, `src/App.jsx:27` mounts public `/privacy`, `/terms`, `/security`, `/subprocessors`, `/support`. Landing/sign-in, password recovery/MFA and workspace onboarding are boot gates; they are not extra operational modules. `src/config/routes.js:30` preserves legacy redirects such as `/Drawings` → drawing-hub tab, `/Schedule` → ScheduleHub, `/Financials` → CostHub, `/Team` → OrgMembers and `/AIInsights` → PortfolioHub. Preserve these entry points when consolidating a rebuild; a file called a hub and its sub-page are not necessarily separate business capabilities.

## What was actually changed

The only directly edited top-level registered page files are **Dashboard, CommandCenter, ExecutiveView, PortfolioHub, Notes and PayApplications**. Additional targeted changes are in RFI forms/mutations, the drawing table's appearance, two financial reports, canonical piece rollups, shared financial helpers and the application shell/security/data layer. No route was added or removed. This is substantial cross-cutting hardening and focused job-review work; it is not a completed full-app rebuild.

Key source boundaries to preserve during rebuilding:

- Tenant/auth: `src/lib/AuthContext.tsx`, `src/components/shared/{OrgContext,ProjectContext}.jsx`, `src/lib/{activeOrg,projectSelection,localDataOwnership}.ts` and `src/components/nav/WorkspaceSelector.tsx`.
- Complete reads/financial truth: `src/api/client/{entities,entityClient}.ts`, `src/lib/portfolioScope.ts`, `src/pages/commandCenter/commandCenterData.ts`, `src/services/costRollup.ts`, `src/utils/earnedValue.ts`.
- Field identity/replay: `src/hooks/useFieldOutbox.js`, `src/lib/field/{OutboxContext,offlineQueue,photoSync,progressSync,replayClient}` and `src/api/client/uploads.ts`.
- Steel rules, mostly unchanged: submittal workflow mapping, drawing/RFI link identities, fabrication release and canonical piece lifecycle. `ARCHITECTURE.md:174` documents IFA → OFA → BFA → OFS → IFC → Released for Fab, with R&R derived; submittals remain workflow authority. Do not replace these with dashboard labels or model conclusions.
- Backend changes on this branch: the three new `20261007073051`, `20261007084117`, `20261007090057` migrations; shared MFA helper and seven handler integrations; account-erasure concurrency/immutable-authorship fixes. The staging release additionally applied four existing base migrations, so **seven staged migrations does not mean seven new branch SQL files**.

## Readiness limits and integrations

Current evidence is in `docs/audits/STEEL_EXECUTIVE_RELEASE_2026-10-07.md`, `STAGING_ACCEPTANCE_2026-10-07.md` and `CONSTRUCTION_DESIGN_REFINEMENT_2026-10-07.md`. Those records report application CI on source `3157e32c` passing 7,458 unit tests, 76 browser checks, type/lint/source gates, build and bundle budgets. They distinguish synthetic presentation checks from real hosted staging auth/workspace/field-photo/erasure acceptance. This inventory did not rerun those checks or test every module.

Seven migrations/seven guarded functions were accepted only in staging. The current frontend was not published to either Worker; production and main were not changed. Seven required production migration versions, five high development-tooling dependency findings, billing/read-service configuration, native delivery and operational acceptance remain explicit holds. Passing aggregate CI is not business acceptance for each of the 78 pages.

`src/lib/integrationCatalog.ts` states:

- Email: forwarding/Power Automate available; direct Outlook and Gmail coming soon.
- Accounting: CSV workflow/custom setup; QuickBooks/Sage/Vista live sync coming soon.
- Documents: app storage available; SharePoint/OneDrive links require a deployed sync connector; Google Drive/Dropbox coming soon.
- Schedule: MS Project XML import and ICS export available; MS Project export/P6 coming soon.
- BIM: internal partially-live source, but customer-facing IFC/GLB/GLTF viewer/model registry/linking and Autodesk cloud are marked coming soon.

These are catalog claims, not newly verified deployed connections. No provider requests, secret reads or remote mutations were performed for this inventory.

## Suggested next rebuild priority

**Preserve the verified branch foundation, reconcile it with the supplied backup, then rebuild and accept the core steel delivery workflow before adding another isolated AI feature.** Root's backup comparison places the backup at the branch base, so replacing the checkout wholesale would discard the focused fixes above.

1. **First bounded product pass: drawing approval → release → work package/pieces → scheduled delivery → field installation/record → change evidence.** Make these existing modules share clear job context, source drilldowns, required-date/owner evidence and consistent loading/failure behavior. Run representative owner/PM/field/viewer acceptance across that chain; the newest job-review UI already supplies its entry point. This is a priority recommendation, not a claim those workflows are currently all defective.
2. **Close concrete data-integrity gaps encountered in this inventory before relying on downstream forecasts.** `src/pages/Constraints.jsx:145` still catches each engine-source fetch failure as `[]`, making a failed RFI/submittal/delivery/task/drawing/inspection source indistinguishable from no records to that engine. `src/pages/schedule/commitImportedTasks.ts:67` still calls `ScheduleTask.create` for every imported task; existing tasks only feed WBS generation, so same-file re-import has no match/update/deduplication path. Both are unchanged from the base. The latter is also documented in `TECH_DEBT.md:317`. Scope a regression/repair separately; no fixes were made here.
3. **Second product pass: complete commercial handoffs and closeout.** Validate installed/progress evidence, labor/equipment/materials, potential change → CO → revised budget → SOV/pay application, then punch/quality/closeout/warranty. The branch fixed arithmetic/read integrity, not each transactional workflow.
4. **Make preconstruction and integrations explicit scope decisions.** Dedicated bids/estimates/takeoffs, purchasing/inventory/accounting sync and payroll cannot be advertised as complete based on budget fields, a PO number or catalog cards. Determine required subcontractor workflows before adding new modules or removing existing ones.
5. **Add model-assisted capture/explanations after these evidence and permission boundaries are accepted.** The existing intelligence roadmap separates calculated brief from model execution and requires bounded spend, permissions, source traceability and review. New provider/API work is paused for this inventory; no credential decision or model implementation was attempted.

Older audits are discovery aids, not a current unresolved-defect count. `TECH_DEBT.md` and the September production-readiness report include now-superseded findings (for example old MFA/erasure and drawing-summary reachability statements). Reproduce each candidate against this snapshot before scheduling a fix; do not copy their historical deployed row counts or security conclusions into the rebuild status.
