# Agent Claims — concurrent-work coordination board

Multiple AI agent sessions write to `main` at the same time. This file is a
lightweight, in-repo "who's touching what right now" board so agents don't
clobber each other's files. It is a **convention, not a lock** — but a claim
that overlaps yours is your early warning to pick a different slice or
coordinate before editing.

## Protocol (every session that edits code)

1. **Before editing:** `git pull origin main`, read **Active claims** below, and
   check whether your target files/areas overlap an open claim.
   - Overlap? Pick a different slice, scope tightly around it, or wait.
2. **Claim it:** add one row to **Active claims** (date UTC · session slug ·
   area · files/globs · one-line intent), then commit *just this file*
   (`git add AGENT_CLAIMS.md`) and push. One row per active session.
3. **Work** in your claimed area; commit + push real changes as usual.
4. **Release:** when the session ends (or you leave the area), delete your row,
   commit this file, and push.

Notes:
- A merge conflict **on this file** is expected and good — it means another
  agent is active. Resolve by keeping both rows.
- Stale rows (date > 2 days old) — assume the session ended; remove them.
- Command Control Centers use `--cmd-*` under `[data-skin="command"]`. Dark is
  via token remap — do not wrap command pages in `.sbd-*` chrome or force light
  in `LayoutRoute`.
- This board does not replace the git-safety rules (CLAUDE.md, Workflow rules): explicit
  staging, no force-push, deploy only when asked.

## Active claims

| Claimed (UTC) | Session | Area | Files / globs | Intent |
|---|---|---|---|---|
| ~~2026-09-21~~ released | codex-launch-security-hardening | Verified launch audit fixes | CI/deploy scripts, owned Edge Functions, scoped authorization migration/tests, privacy disclosures and audit/runbook evidence | Owner approved #461; migration and three reviewed functions are live and verified. Frontend merge proceeds after final staging/CI checks. Remaining audit work is tracked separately. |
| ~~2026-09-21~~ released | codex-claude-pending-issues | Reconcile three Claude handoffs | drawing register/viewer, RFI vocabulary, exports, comments/project reads, related tests and handoff docs | Fixes consolidated in #460; staging and production backend verified after owner approval. Frontend release proceeds through gated CI. |
| ~~2026-09-13~~ released | codex-supabase-drift-repair | Supabase production drift reconciliation | supabase/production-ownership-manifest.json; scripts/supabase*; scripts/__tests__/supabase*; recovered migration sources; docs/runbooks/supabase-production-ownership.md; focused drift evidence/tests | Compare live ledger/schema and repair verified drift; preserve data and release gates. |
| ~~2026-09-13T08:33:29Z~~ released | copilot-merge-conflicts-5652236907 | Merge conflict resolution | AGENT_CLAIMS.md; conflicted files from merge with main | Merged current main, preserved workflow behavior, and reconciled the concurrent PR-head resolution. |
| 2026-08-13T20:10:00Z | grok-notes-apple-pencil | Tools Notes Apple Pencil ink | src/pages/Notes.jsx; src/lib/notesInk/**; src/components/notes/InkCanvas.tsx | Upgrade Notes ink: coalesced/predicted strokes, pressure+tilt, palm rejection, highlighter, undo/redo, vector persistence. |
| 2026-08-09T00:07:05Z | codex-ui-ux-liquid-glass | Professional UI/UX cleanup + native iOS Liquid Glass | docs/superpowers/{specs,plans}/2026-08-09-professional-ui-liquid-glass*; src/styles/{tokens,base,command,responsive}.css; src/pages/Settings.jsx; src/pages/settings/**; src/components/{settings,nav,ui,design-system}/**; src/lib/native/**; capacitor.config.ts; ios/**; mobile/ios/**; related tests/docs | Normalize typography, dark-theme contrast, spacing, icons and shared settings patterns; add an iOS 26 SwiftUI Liquid Glass command dock with earlier-iOS fallback. |
| ~~2026-07-28T04:47:00Z~~ released | cursor-logistics-wp-filter-bulk-0b3b | Logistics WP filter + bulk select-all | src/components/pieceControl/PieceLogisticsControl.tsx, src/lib/pieceControl/logisticsRepository.ts, src/styles/piece-control-command.css | Mirror Production: work-package filter + select-all on Ship/Deliver/Erect panels. |
| ~~2026-07-28T04:40:00Z~~ released | cursor-production-wp-filter-0b3b | Production board work-package filter | src/components/pieceControl/PieceProductionControl.tsx, src/lib/pieceControl/productionRepository.ts, src/styles/piece-control-command.css | Add WP filter (all / unassigned / package) on Production board for bulk station work. |
| ~~2026-07-28T03:55:00Z~~ released | cursor-bulk-production-0b3b | Bulk production station advance | supabase/migrations/20260728040000_advance_piece_stations_bulk.sql, src/lib/pieceControl/productionRepository.ts, src/lib/pieceControl/bulkStationAdvance.ts, src/components/pieceControl/PieceProductionControl.tsx, src/styles/piece-control-command.css | Set-based advance_piece_stations RPC + multi-select Complete next/station on Production board. — PR #179 |
| ~~2026-07-30T22:54:00Z~~ released | cursor-large-file-refactor-ec34 | Hub inlineControls slice 1.1 completion | src/pages/drawingSubmittalHub/inlineControls.tsx, triageBoard.tsx, ControlBoardPanel.tsx, components.tsx | Extract InlineOwner/Date/Detailing to inlineControls.tsx per refactor plan. |
| 2026-07-26T04:00:00Z | cursor-ap-contacts-dms-d3a1 | Contacts + DocumentStorageSettings hygiene | src/pages/Contacts.jsx, src/components/contacts/ContactFormModal.jsx, src/components/dms/DocumentStorageSettings.jsx, src/pages/Vendors.jsx | RegisterFetchBody + Contact create withProjectId/toasts; LinkedFolder.create fail-closed; Vendors toast hygiene (IDs 18/48/50). |
| 2026-07-12T00:00:00Z | opus-phase1-batch1 | False-success cleanup batch 1 | src/api/client/functions.ts, src/config/routes.js, src/pages/AgentMemory.jsx, src/components/dms/DocumentStorageSettings.jsx | Fail-close unavailable backend invokes; remove AgentMemory route exposure; disable fake linked-folder Sync now action until backend implementation exists. |
| 2026-07-12T12:00:00Z | opus-feature-flags-batch9 | Feature-flag authority consolidation (Batch 9) | src/lib/featureFlags.jsx, src/__tests__/featureFlags.test.js, src/hooks/useFeatureFlag.ts, supabase/migrations/20260712000000_seed_feature_flag_catalog.sql, supabase/migrations/20260703180000_seed_submittal_approved_to_scrub_flag.sql, supabase/migrations/20260704000000_seed_submittal_revision_autobump_flag.sql, supabase/migrations/20260704000010_seed_submittal_splitting_flag.sql, supabase/migrations/20260704020010_seed_submittal_workday_dues_flag.sql, supabase/migrations/20260704030000_seed_submittal_drawing_types_flag.sql, src/config/featureFlags.ts, src/config/__tests__/featureFlagCatalog.test.ts, docs/FEATURE_FLAGS.md, docs/PHASE_0_BASELINE_2026-07-12.md | Remove browser/local feature-flag authority and establish canonical server-backed catalog + SQL seed + tests/docs for production flag governance. |
| 2026-06-28T10:47:45Z | dash-theme-cont-5pages | Dashboard reference continuation — field/quality pages | src/pages/Drawings.jsx, src/pages/Inspections.jsx, src/pages/Photos.jsx, src/pages/Punchlist.jsx, src/pages/QualityControl.jsx, src/pages/Safety.jsx | Add dashboard shell class to page roots to inherit reference chrome spacing/theme. |
| 2026-06-28T11:14:21Z | dash-theme-cont-5pages-2 | Dashboard reference continuation — field hub pages | src/pages/FieldHub.jsx, src/pages/Inspections.jsx, src/pages/Photos.jsx, src/pages/Punchlist.jsx, src/pages/QualityControl.jsx, src/pages/Safety.jsx | Continue adding reference page wrapper to additional non-excluded field surfaces. |
| 2026-06-28T04:33:06Z | dash-theme-rollout | Dashboard theme rollout | src/Layout.jsx src/pages/Dashboard.jsx src/pages/dashboard/DashboardHeader.jsx src/components/nav/SidebarNav.jsx src/boot/LayoutRoute.jsx | Expand dashboard chrome to additional non-excluded routes and align dashboard header/route targeting. |
| 2026-06-28T09:53:40Z | dash-theme-5pages | Dashboard reference UX polish | src/pages/Settings.jsx src/pages/RFIs.jsx src/pages/Documents.jsx src/pages/ActionItems.jsx src/pages/ChangeRequests.jsx src/pages/ProjectMembers.jsx src/components/nav/ProjectPillDropdown.jsx src/components/nav/TopBarSearchButton.jsx | Apply reference dashboard page shell styling to 5+ pages while keeping current routing/navigation changes. |
| 2026-06-28T17:42:00Z | dark-theme-full-app | Full app dark theme (parallel agents) | src/components/ui/**/* src/components/design-system/**/* src/components/shared/**/* src/components/drawings/**/* src/components/submittals/**/* src/components/schedule/**/* src/components/gantt/**/* src/components/financials/**/* src/components/viewer/**/* src/pages/!(Dashboard|RFIs|Documents|Settings|ActionItems|ChangeRequests|ProjectMembers)/* (all other domains + viewers + base UI; coordinate around active dash claims) | Complete consistent SteelBuild dark (steelbuild-dark + tokens + sbd- classes) across entire app with parallel agents. Fix light color leaks, ensure full dark mode compliance and token usage. |
| 2026-06-29T18:45:00Z | opus-lazychunk-cache | Lazy-chunk 404 prod incident — cache headers | vercel.json | Immutable Cache-Control on /assets/* so deploy-storm chunk rotation stops 404ing active users' lazy-loaded PDF viewer + revision-upload modal (PDF won't open / can't upload revision). |
| 2026-06-30T00:00:00Z | opus-detailing-panel-light | Detailing CC panels → kit palette (owner-directed) | src/styles/command.css (ADDITIVE `.detailing-cc` block only — does NOT alter existing rules) | Historical light-palette patch for shipped command_ui Detailing panels. Current maintenance follows the dual-theme `--cmd-*` token remap guidance above; do not treat this as a light-only directive. |
| 2026-07-01T00:00:00Z | enterprise-readiness | Enterprise-readiness audit remediation (base = fresh origin/main worktree). Avoided command palette/cache areas during that audit slice (NOT touching `src/components/command/**`, `src/styles/command.css`, or `vercel.json`) — those items were deferred to owner checklist. | docs (README/ARCHITECTURE/TECH_DEBT/AGENTS), .gitignore, public/.well-known/**, docs/runbooks/**, supabase/migrations/**, supabase/functions/**, .github/workflows/ci.yml, package.json, src/lib/query-client.ts, src/instrument.js, src/lib/AuthContext.tsx, src/services/auditLogger.ts, src/styles/base.css (ADDITIVE focus-ring only), src/components/design-system/**, src/components/shared/**, src/pages/{Privacy,Terms,Security,Landing}.jsx + non-command form modals | 133-finding audit remediation: RLS role-floor, edge-fn hardening, command palette excluded for that slice, CI/CD, docs, compliance. |
| 2026-07-06T12:00:00Z | dashboard-command-ui-handoff | Dashboard command_ui portfolio + fetch gating | src/pages/Dashboard.jsx | Reuse command-style Portfolio Control Center for `!projectId` and skip portfolio-irrelevant dashboard queries in portfolio mode. |
| 2026-07-06T19:05:00Z | dashboard-command-ui-handoff | Dashboard + Portfolio derive parity cleanup | src/pages/Dashboard.jsx, src/pages/portfolio/portfolioControlCenter.derive.ts, src/pages/portfolio/__tests__/portfolioControlCenter.derive.test.ts | Add command-mode portfolio entrypoint data wiring/buffering + sync scoring inputs with shared `computePortfolioProjectHealth` helper; update derive tests for delayed-task and late-delivery semantics. |

## Recently released
- 2026-09-13 · claude-drift-followups · Made the Supabase retirement workflow file valid (GitHub had failed a run on every push) and hardened the drift entrypoint SQL test: six database shapes, a catalog-wide scope check and 13 guard cases.
- 2026-08-06 · cursor-page-refactor-2696 · Piece Register and Onboarding large-page extracts re-landed clean and merged as #249 and #250; Resource Scheduling remains unclaimed for a future focused PR.
- 2026-08-05 · pr-hygiene-train · Merged supersedes: #221–#225, #227, #229, #232–#233, #236–#237, #239 (Package Board chain still open if #240 pending). Dirty mega-PRs re-landed clean; see `.claude/agent-memory/construction-pm-dev/pr-supersede-hygiene.md`.
- 2026-08-05 · enterprise-tier1 · Signup clickwrap + PM write floor migration + Stripe Tax hooks + `supabase:drift` + vercel main deploy off (#236).
- 2026-08-05 · detailing-event-glue · targetSetId create/link + revision attach + status suggest (#239).
- 2026-08-05 · module-gates · Nav/route scope-cut via `module_*` flags (#233).
- 2026-08-05 · opaque-dark-menus · `--sbd-bg-panel*` + `.sbp-opaque-popout` (#237).
- 2026-08-05 · 3d-fab-color-refresh · Lifecycle writes invalidate `canonical-pieces-3d` (#232).

- 2026-07-27 · cursor-tablet-pm-kit-design-3d17 · Tablet PM layout kit Phase 0 (PR #160).
- 2026-07-27 · cursor-project-archive-reappear-3d17 · Fix archived projects reappearing in switcher (PR #159); apply migration `20260727012111`.
- 2026-07-27 · cursor-piece-wp-auto-assign-d3a1 · Piece↔WP auto-assign by sequence/area (PR #169); claim released after PR open.
- 2026-07-27 · cursor-eng-quality-tier3-0569 · Eng quality Tier 3: MutationCache, edge reportError, org/billing types patch, ScheduleGantt/TaskDetailDrawer/Portfolio/SubmittalDetail extracts, schedule helpers TS conversion; claim released after PR open.
- 2026-07-27 · cursor-dual-theme-dark-0b3b · Dual-theme dark completion Phase 4 closed; claim released after docs/status/owner-lock cleanup.
- 2026-07-27 · opus-command-ui-lock · Retired historical light-only `command_ui` owner lock. Command Control Centers now remain on `--cmd-*` under `[data-skin="command"]`; dark is maintained through token remap, not `.sbd-*` wrappers or `LayoutRoute` light forcing.
- 2026-07-26 · cursor-ap-batch-deploy-d3a1 · Merged #139–#149 action-plan hygiene batch + production deploy.
- 2026-07-26 · cursor-ap-email-review-d3a1 · EmailAccount/ReviewQueue/TransmittalLog create fail-closed + loading skeletons.
- 2026-07-26 · cursor-ap-contacts-dms-d3a1 · Contacts RegisterFetchBody + Contact/LinkedFolder create fail-closed + Vendors toast hygiene.
- 2026-07-26 · cursor-ap-dms-scoping-d3a1 · DMS UploadModal/LinkedFolderBrowser Document.create withProjectId + Edit/Detail toast hygiene.
- 2026-07-26 · cursor-ap-photos-safety-loading-d3a1 · Photos + Safety INLINE LoadingSkeleton + error/empty gates (ID 18).
- 2026-07-26 · cursor-ap-commercial-toasts-d3a1 · Backcharges/PayApps/EmailInbox/Documents/SOV toast + create fail-closed hygiene (IDs 48/50).
- 2026-07-26 · cursor-ap-import-doccontrol-d3a1 · Expense/CO CSV import + ReviewQueue/ImpactBoard/RFIFormModal withProjectId; Doc Control/Resource toast hygiene.
- 2026-07-26 · cursor-ap-modal-scoping-d3a1 · Modal withProjectId + toast hygiene (ActionItem/Scope/Delivery/Photo/Risk/Resource/ProductionNote; Expenses/ScopeExclusions).
- 2026-07-26 · cursor-ap-loading-toasts-d3a1 · RegisterFetchBody + loading/empty/error on Warranty/CR/Closeout/Punchlist/QC; toast helper adoption (ID 18 Done / 48 advanced).
- 2026-07-26 · cursor-ap-next-slice-d3a1 · Drawings mutation helpers + FabRelease/Contract/Schedule/Deliveries create scoping on PR #123.
- 2026-07-26 · cursor-ap-next-slice-d3a1 · RFIs helpers + ops/email/escalate withProjectId adoption on PR #123.
- 2026-07-26 · cursor-ap-next-slice-d3a1 · Mutation adoption continuation (Submittals helpers, commercial withProjectId, toast helper adoption) on PR #123.
- 2026-07-25 · cursor-piece-wp-3d-glue-3d17 · Piece↔WP↔fab↔3D glue shipped (PR #129). Apply migration `20260725210000` on prod.
- 2026-07-25 · cursor-remove-autolock-3d17 · Removed drawing-set auto-lock on terminal submittal approval (PR #126); deployed to production.
- 2026-07-25 · cursor-unlock-drawing-sets-3d17 · Unlock all locked drawing sets (migration `20260725203000`; PR #124). Local + prod applied (owner ran unlock SQL on `kjrwqagyeswwoxpjkcko`).
- 2026-07-25 · cursor-rr-stage-3d17 · Drawing approval lifecycle Slices 0–10 complete on PR #122 (R&R through legacy cleanup).
- 2026-07-25 · cursor-rr-stage-3d17 · Drawing approval lifecycle Slice 7 (R&R/OFS/BFA risk aging + Critical ActionItems) on PR #122.
- 2026-07-25 · cursor-rr-stage-3d17 · Drawing approval lifecycle Slices 0–5 shipped on PR #122 (R&R stage, cycles, evidence gate, OFS scrub/IFC checklist, comment dispositions). Branch cursor/drawing-approval-lifecycle-rr-stage-3d17.
- 2026-07-25 · cursor-rr-stage-3d17 · Drawing approval lifecycle Slices 0–4 shipped on PR #122 (R&R stage, approval cycles, R&R evidence gate, mandatory OFS scrub + IFC checklist). Branch cursor/drawing-approval-lifecycle-rr-stage-3d17.
- 2026-07-25 · cursor-rr-stage-3d17 · R&R promoted to a first-class derived workflow stage (Slices 0–1 of the drawing-approval-lifecycle plan; PR #122, branch cursor/drawing-approval-lifecycle-rr-stage-3d17). Display-derivation only — drawings.stage CHECK untouched.
- 2026-07-25 · cursor-ap-next-slice-d3a1 · withProjectId write shaping + action-plan tracker checkpoint (IDs 19/43/64/68/70/84/89/92/94/95/97/99/103–105).
- 2026-07-24 · cursor-ap-14-17-d3a1 · Action plan IDs 14–17 sync honesty, corrected-flow retest, hooks check, Sentry triage.
- 2026-07-24 · cursor-action-plan-d3a1 · Action-plan completion pass (ledger, hygiene, security identity, ResourceScheduling helpers).
- 2026-07-24 · cursor-debug-prod-sentry-d3a1 · Prod Sentry fixes cherry-picked into action-plan branch.
- 2026-07-24 · cursor-drawing-fab-d3a1 · Drawing/submittal/fab-release control hardening (exact sheet match, transition graph, package fab gate parity).
- 2026-07-24 · cursor-piece-pma-d3a1 · Piece Register command-deck restore + Project Assistant removal (PR open).
- 2026-06-22 · opus-gtm-batch · GTM readiness batch SHIPPED + field-verified — security headers (HSTS + Permissions-Policy + CSP Report-Only in `vercel.json`), public legal pages (`Privacy/Terms/Security.jsx` + `App.jsx` short-circuit), demo form → `public.demo_requests` (migration `20260623032908`, anon insert / admin select; Landing wired), `package.json` engines. Storage backfill = WRITTEN ONLY (`scripts/storage-backfill-legacy-uploads.mjs`, dry-run) — see runbook `docs/HANDOFF-2026-06-22-gtm-batch.md`. Owner follow-ups: demo email-notify, flip CSP→enforcing, legal counsel review, E2E enable, Sentry alerts, a11y pass.

<!-- Move finished claims here briefly, or just delete the row. -->
- 2026-06-22 · opus-noimplicitany · noImplicitAny CI ratchet SHIPPED — `npm run typecheck:noimplicitany` now blocks the `ci` job (sibling of typecheck:strict, shares `scripts/lib/tscDiagnostics.mjs`). Core `services/workflowEngine.ts` + tests + small pages cleaned; 13 heavy schedule/gantt/procurement/submittal/work-package pages grandfathered in `NOIMPLICITANY_IGNORE` — SHRINK that list, never grow it.
- 2026-06-22 · opus-strict-ratchet · strictNullChecks CI ratchet SHIPPED — `npm run typecheck:strict` (filter script, not naive exclude) now blocks the `ci` job; all 395 strict-null errors resolved except ResourceScheduling.tsx + GanttChart.tsx (grandfathered in `scripts/strict-typecheck.mjs` STRICT_NULL_IGNORE — SHRINK that list, never grow it). Both type-safety gates share the filter. Design: `docs/superpowers/specs/2026-06-22-strictnullchecks-ratchet-design.md`.
- 2026-06-20 · opus-db-baseline · MIGRATION FREEZE lifted — baseline squash cutover DONE (3 baseline files in supabase/migrations/, 190 archived, prod schema_migrations reconciled, db push clean). New migrations OK again; follow the ARCHITECTURE.md → Migrations lockstep rule.
