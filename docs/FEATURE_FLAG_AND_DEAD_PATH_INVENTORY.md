# Feature Flag and Dead Path Inventory

Date: 2026-07-14
Batch: 38
Starting commit: 307dafbfeade773c69c158b5194fd4f5aa3f5153
Branch: agent/handoff-cleanup

## Scope and authority

This inventory covers runtime feature flags, route compatibility metadata, retired presentation branches, unconnected visible controls, and candidate dead implementations found during Batch 38. It is based on source search, route registry inspection, import/caller search, and the existing Phase 0 handoff documents.

Supabase `feature_flags` is the only runtime flag authority. The typed catalog in `src/config/featureFlags.ts` is the production key allowlist. `useFeatureFlag.ts` resolves global enablement and case-insensitive per-user overrides from Supabase; it does not read localStorage, URL query strings, or browser fallback state. RLS and RPC remain authoritative for access and writes.

## Feature flag catalog

The applied catalog migration contains the historical presentation key `command_ui`. It is not removed by a new migration because migration history and any remote row must remain intact. The key is retired from the TypeScript catalog and has no runtime consumer.

| Key | Default | Runtime consumers | Category | Disposition | Owner action |
| --- | --- | --- | --- | --- | --- |
| `account_deletion` | false | `src/components/settings/DangerZone.jsx` | Safety / destructive action | KEEP | Keep fail-closed while deletion service is operational. |
| `revision_ai_diff` | false | `src/components/drawings/RevisionCompareModal.jsx`, `src/pages/Drawings.jsx`, drawing register panels | Experimental workflow | KEEP | Review rollout separately from presentation cleanup. |
| `submittal_approved_to_scrub` | false | `src/pages/Submittals.tsx`, submittal action helpers | Workflow safety | KEEP | Administrator-managed rollout only. |
| `submittal_drawing_types` | false | `src/pages/Submittals.tsx` | Workflow capability | KEEP | Preserve until drawing-type workflow is retired deliberately. |
| `submittal_revision_autobump` | false | `src/pages/Submittals.tsx`, revision helpers | Workflow capability | KEEP | Preserve server-backed revision behavior. |
| `submittal_splitting` | false | `src/pages/Submittals.tsx` | Workflow capability | KEEP | Preserve lineage and split safeguards. |
| `submittal_workday_dues` | false | `src/pages/Submittals.tsx`, Drawing Submittal Hub, drawing register panels | Schedule/workflow capability | KEEP | Preserve workday due calculations and rollout state. |
| `viewer_3d` | false | `src/pages/DrawingSubmittalHub.tsx` and `src/components/viewer3d/Model3DTab.jsx` | Experimental integration | KEEP | Preserve the disabled-by-default 3D workflow. |
| `command_ui` | historical true row | None after Batch 38 | Presentation migration | RETIRE | Do not add a clearing migration; remove runtime consumers and retain the historical migration row. |

### Catalog measurements

- Typed production keys: 9 before Batch 38, 8 after removing `command_ui`.
- Presentation flag consumers: 15 production source files before Batch 38, 0 after Batch 38.
- Operational flag consumers: preserved; no operational key was removed or renamed.
- Runtime override behavior: global server value plus case-insensitive per-user server override only.

## Route inventory

The route registry contains 75 registered page entries. Every registry entry has a label and an explicit `active` or `internal` lifecycle; `DataExchange`, `UsersManagement`, `ProjectMembers`, and `FeatureFlagsAdmin` are internal operational or privileged pages. Static compatibility metadata contains 10 mounted aliases and entry points.

| Compatibility path | Kind | Target | Disposition |
| --- | --- | --- | --- |
| `/` | entry | - | KEEP |
| `/Landing` | entry | - | KEEP |
| `/GanttChart` | redirect | `/Schedule` | KEEP compatibility |
| `/RFIHub` | redirect | `/RFIs` | KEEP compatibility |
| `/Financials` | redirect | `/CostHub` | KEEP compatibility |
| `/CostDashboard` | redirect | `/CostHub` | KEEP compatibility |
| `/ProjectDetail` | redirect | `/Projects` | KEEP compatibility; query-preserving redirect |
| `/ResourceManagement` | redirect | `/ResourceHub` | KEEP compatibility |
| `/AIInsights` | redirect | `/PortfolioHub` | KEEP compatibility |
| `/MarginRisk` | redirect | `/RiskHub` | KEEP compatibility |

Specialized routes remain supported and were not classified as dead: `/Reports/:slug`, `/DrawingViewer`, `/Drawings`, `/ResourceScheduling`, `/Constraints`, `/ExecutiveView`, and the project-scoped domain pages. Redirect targets are validated by the existing route-contract tests.

## Retired runtime branches

Batch 38 removed the remaining production presentation selection based on the retired flag from the following live surfaces: Action Items, Budget Hours, Command Center, Dashboard, Drawing Viewer, Field Today, Procurement, Projects, Schedule of Values, and drawing-register Doc Control. The modal/light-surface styling reads no presentation flag; the 3D viewer keeps only its operational `viewer_3d` gate at the hub boundary.

The canonical control-center components and `src/styles/command.css` remain because they are now active presentation code. They are not feature-flag fallbacks. No database schema, migration, RLS policy, RPC, operational flag, or domain mutation was changed.

No implementation files were deleted in Batch 38. Candidate files were retained where they are shared by active workflows or where an import/caller proof pass did not establish safe deletion. Deletion requires a separate owner-reviewed inventory with route, import, test, and dynamic-loader evidence.

## Visible dead ends and unconnected controls

| Evidence | Current behavior | Disposition | Follow-up |
| --- | --- | --- | --- |
| `src/components/dms/DocumentStorageSettings.jsx:23-24` | Google Drive and Dropbox provider options are disabled and labeled "Coming soon". | HIDE | Keep hidden until an authenticated provider integration is shipped. |
| `src/components/dms/DocumentStorageSettings.jsx:435-436` | Folder Sync is a disabled button that reports "Folder sync is not available yet". | HIDE | Remove or hide the control until sync has a live write path. |
| `src/api/client/functions.ts:82` | Generic dispatcher warns that unsupported Edge Function names are not implemented. Supported named cases remain live. | FINISH | Replace the open-ended fallback with a typed allowlist or remove unsupported callers after owner review. |
| `src/components/email/EmailAccountSettings.jsx:190` | Direct Azure AD sign-in is explicitly labeled as requiring future app registration. | KEEP/HIDE | Product roadmap disclosure; do not present as an available connector. |
| `src/components/drawings/upload/StepReview.jsx:163` | Scanned image PDFs cannot use AI text extraction and instruct the user to enter metadata manually. | KEEP | This is a valid capability limitation with a manual recovery path, not a dead action. |
| `src/pages/Integrations.jsx:234,248` | Integration cards disclose coming-soon providers and available-now state. | KEEP/HIDE | Preserve truthful roadmap messaging; hide only if product chooses to remove roadmap cards. |

No empty mutation handlers or new false-success controls were introduced by Batch 38. Existing HIDE/FINISH findings remain follow-up work and were not silently converted into completed features.

## Evidence and follow-up rules

- Runtime searches must distinguish live source from historical handoff/spec documents and immutable migrations.
- New feature flags require a typed catalog key, a reviewed SQL catalog row, a server-backed resolver call site, and focused tests.
- A page or module may be deleted only after route registration, static compatibility routes, direct imports, dynamic imports, tests, and shared workflow usage are all disproven.
- Canonical presentation code must not branch on a presentation flag. Operational flags remain allowed when they gate a real workflow capability or safety control.
- Historical handoff documents and applied migrations retain their original wording for auditability; they are not runtime authority.

## Batch 38 validation record

- Added `src/__tests__/commandUiRetirement.test.js` to assert that the retired presentation flag and camel-case branch identifier do not re-enter runtime source.
- Existing feature-flag resolver tests remain the authority for server loading, disabled-until-resolved behavior, and case-insensitive per-user overrides.
- Required route and source searches, lint, type gates, full tests, and production build are recorded in the Phase 0 baseline after execution.
- No deployment, production migration, or merge is part of this batch. PR #77 remains Draft.
