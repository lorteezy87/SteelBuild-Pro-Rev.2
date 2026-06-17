# Technical Debt

Living list of known issues, follow-ups, and "we'll fix it later" items.
Each entry has a clear remediation path so future contributors know
exactly what's needed.

---

## Active items

_Updated 2026-06-16. RLS is enabled everywhere and the **org boundary is wired
into the access layer** (no cross-tenant reads), billing + plan enforcement are
live, and data export works. These are go-to-market, typing, and
platform-maturity follow-ups._

### Monetization / go-to-market

- **Legal pages** — the self-serve signup needs ToS / privacy / a basic DPA to
  link to. The wording needs a lawyer; the pages can be scaffolded.
- **Storage backfill (app-files cross-project read residual)** — verified
  2026-06-17: **775** legacy flat `app-files/uploads/<ts>-<rand>` objects predate
  org-prefixing. The set is **frozen** — the uploader cut over cleanly (last flat
  upload Jun 16 08:06; org-prefixed `<org_id>/uploads/...` uploads start 08:29, 32
  so far), so the problem isn't growing. **Exposure:** the `app-files` SELECT
  policy `auth_read` reads flat paths via the branch
  `foldername[1] = 'uploads' AND user_is_org_member(founding_org_id())` — i.e. any
  member of the **founding org** can read every legacy flat file regardless of
  project membership. Org isolation already closed the cross-**org** hole, so this
  is now **intra-founding-org cross-project** read of legacy files only (low
  severity while S&H Steel is the sole org; matters before adding outside members
  to the founding org). **Why deferred:** the remediation is a risk-bearing live
  migration and can't be done from SQL/MCP (a `name` rename moves the row but not
  the S3 bytes → broken links; needs the Storage API). **Remediation (needs a
  service-role script, run by an owner):** (1) for each of the 775 objects,
  Storage `copy`/`move` `uploads/<f>` → `<founding_org_id>/uploads/<f>`;
  (2) backfill every DB `file_url` reference (audit all text columns holding
  `uploads/...`, e.g. `drawings`, `uploaded_files`, `model_registry`,
  attachment tables, then UPDATE the prefix); (3) verify every ref resolves;
  (4) only then drop the `'uploads'` branch from the `auth_read` policy so the
  flat paths become unreadable and the gap closes. Do copy-then-verify-then-cut
  (reversible until step 4).
- **Org → project access model** — `user_has_project_access` now gates by org
  membership while `user_projects` still drives project *role*. Decide whether
  org members auto-see all org projects or stay per-project before onboarding
  teams (today a new member sees a project only once added to `user_projects`).
- **Deprecated edge functions** — `sharepoint-proxy` / `bluebeam-proxy` are still
  deployed but unused by the client; `supabase functions delete` them.
- **Stale generated types** — `src/types/supabase.ts` lacks the org/billing
  tables (and `vendors.org_id`, `*.client_op_id`). Untyped JS access works;
  regenerate via the Supabase MCP on the next pass.

### Platform maturity (longer-running)

- **TypeScript conversion** — ~86% of `src` is still JS/JSX (141 TS vs 864 JS).
  `src/services/` is fully typed; convert incrementally, shared-infra-first.
  `strict:false` today.
- **Full-browser E2E** — jsdom integration tests gate CI; no signed-in Playwright
  flow yet (needs a seeded test user / self-signup against a non-prod project).
- **A11y audit + mobile/iPad polish** on core workflows; **large-project
  performance** (virtualization, server-side filtering, narrow invalidation).

### From the 2026-05-26 enterprise-readiness audit (still open)

- **Dashboard / secret hand-offs (need owner access — step-by-step in
  [`docs/enterprise-readiness-handoff-2026-05-26.md`](docs/enterprise-readiness-handoff-2026-05-26.md)):**
  two items only the project owner can do — (1) enable Supabase leaked-password
  protection (the one remaining `auth_leaked_password_protection` WARN; the older
  "86 anonymous-access" findings are no longer reported by the advisor),
  (2) optionally add a GitHub branch-protection rule requiring the "CI" status
  check on `main` (note: only gates PR merges, not the current direct-push deploy
  flow — see the doc). No E2E / a11y / bundle budgets yet. (Sentry source-map
  upload is now DONE — confirmed live via release `b5272fd7` + artifact bundle;
  see the doc §2.)

- **Unused-index review (perf, low priority) — REVIEWED, drops queued:** the
  `unused_index` advisor findings were reviewed against live `pg_stat_user_indexes`
  + query patterns; full verdict in
  [`docs/unused-index-review-2026-05-26.md`](docs/unused-index-review-2026-05-26.md).
  Of 170 `idx_scan = 0` indexes, 125 are constraint- or FK-backing (keep — "unused"
  is a low-volume artifact, not dead weight). 5 high-confidence drops (one redundant
  single-col + 4 GIN array/jsonb indexes with no containment query) were **applied
  live 2026-05-26** (migration `20260526180000_drop_unused_indexes.sql`; reversible).
  The rest are low-value either way; revisit with a real traffic window. Do NOT
  bulk-drop.

- **Stale `.vercel/project.json`:** still names the deleted `steelbuild-pro` Vercel
  project (production is `steelbuildpro-og` / steelbuild-pro.com). Harmless
  (Vercel/CI use the GitHub integration, not this file) but misleading — refresh via
  `vercel link`.

---

## Recently-resolved (last 30 days, kept here for context)

- 2026-06-16 **Money-path test net + contract-value fix:** pinned the two
  untested financial modules (`budgetCalculations`, `utils/projectKpis`) and
  fixed a real divergence — `calcContractValue` matched approved COs with an
  exact `=== "Approved"` while canonical `computeRevisedContractValue` trims the
  status, so a whitespace-status CO showed a different contract value on the
  Projects KPI vs Financials. `calcContractValue` now delegates to the single
  source of truth.

- 2026-06-16 **Per-tenant data export:** the Settings "Export Data" button was a
  stub (downloaded only a list of table names). Now a real per-tenant JSON backup
  of every accessible project via the RLS-scoped, audited `project-export` Edge
  Function (deployed) + client bundling (`src/lib/workspaceExport.ts`).

- 2026-06-16 **Multi-tenant data isolation (Tier-0):** wired the org boundary
  into RLS — `user_has_project_access` now requires org membership (the chokepoint
  for ~70 tables), `create_project` rejects a foreign `org_id` (closed a
  privilege-escalation hole), `projects.org_id` set NOT NULL, and `vendors` /
  `user_profiles` / `app-files` storage are org-scoped (migrations
  `20260615000000`–`20260616000000`). Verified 0 cross-tenant reads; advisors 0-error.

- 2026-06-16 **Plan-limit enforcement + self-serve signup + onboarding:** plan
  limits (Free/Pro/Business) enforced server-side in `create_project` /
  `accept_invitation`; signup wired into the landing page; a brand-new workspace
  is routed into the first-run Onboarding wizard (+ a 0-project dashboard welcome).

- 2026-06-13 **Multi-tenant SaaS layer + Stripe billing:** `organizations` /
  `organization_members` / `organization_invitations`, `OrgProvider` + onboarding
  + OrgMembers, and Stripe subscription billing with a tamper-proof `org.plan`
  anchor (`stripe-billing` Edge Function).

- 2026-06 **Self-hosted 3D IFC viewer + AI Revision Intelligence:** replaced the
  removed `@thatopen` stack with a lazy-loaded `web-ifc` + `three` viewer
  (`viewer_3d` flag) with per-piece fab status from `model_elements`; shipped the
  AI revision-diff line (`revisionSnapshotDiff` → `drawing_revision_deltas`,
  Revision Impact Report, Create-RFI-from-delta; `revision_ai_diff` flag).

- 2026-06-03 `vendor-xlsx` (~683 kB / ~179 kB gzip) bundle audit — **already
  async-only; no code change needed.** Follow-up to the PR #55–#59 enterprise
  perf-hardening line (PDF view/export chunk splits). Audited every `xlsx`
  reference: the only real consumers are `src/pages/SOV.jsx`,
  `src/pages/Onboarding.jsx`, `src/pages/DataExchange.jsx`, and
  `src/lib/importPsrSpreadsheet.js` (used by `JobStatusReport` via
  `PsrSpreadsheetImportModal`) — all four load the library with
  `await import("xlsx")` inside explicit import handlers (`handleImportFile` /
  `handleImportClick`), never at module top-level or on mount. The remaining
  ~14 `xlsx` matches are file-extension strings / MIME types, not library
  imports. Production build evidence: `vendor-xlsx-*.js` is referenced **only**
  via `import("./vendor-xlsx-*.js")` (dynamic) in exactly the 4 consumer route
  chunks; zero static `import … from "./vendor-xlsx-*.js"`; the entry
  (`index-*.js`) and router (`AppRoutes-*.js`) chunks never reference it. So
  xlsx is fetched on-demand only when a user invokes a spreadsheet
  import/export action and stays out of every common route's initial load.
  Per CLAUDE.md §1 (smallest complete change), no source edit was made.

- 2026-05-26 deploy/default branch renamed `codex/base44-deploy-nick` → `main`
  (GitHub-native rename: commits preserved, default branch + open PRs updated,
  old name redirects during the grace period). The stale prototype `main`
  (6 abandoned commits) was archived to `archive/old-main-prototype` then
  deleted before the rename. The project owner switched the Vercel Production
  Branch to `main` (the Branch Tracking panel now reads "pushed to the `main`
  branch"). The living docs + CI (`ci.yml`, `CLAUDE.md`, `README`,
  `ARCHITECTURE`, `AGENTS`) were updated to the new name.

- 2026-05-26 RLS multiple_permissive_policies consolidation (143 -> 0): collapsed
  overlapping permissive policies into one per (table, role, action), table-by-
  table, verifying access byte-identical against pg_policies before/after.
  Batch 1 (`20260526190000`): dropped the redundant FOR ALL `project_member_access`
  on 32 standard project-owned tables (fully replicated by the four per-command
  `project_*` policies), the generic `project_*` duplicates on `drawings` /
  `drawing_sets` (domain `drawings_*` / `drawing_sets_*` retained, incl. the
  lock-aware update + admin-only delete), and a duplicate FOR ALL on
  `drawing_zone_activity`. Batch 2 (`20260526200000`): merged the two `projects`
  SELECT policies into one, and split the admin FOR ALL on `default_cost_codes` /
  `feature_flags` into write-only commands (public read already covered SELECT).
  `user_projects` (`20260526210000`): merged the two SELECT policies AND, while
  reviewing it, found + fixed a privilege-escalation hole — the re-introduced
  `users_insert_own_membership` (self-insert with no project/role constraint, no
  INSERT trigger) let any authenticated user grant themselves `owner` on any
  project; dropped it (re-applying migration 082's intent; onboarding is handled
  by the SECURITY DEFINER `create_project()`, member management is admin-only).

- 2026-05-26 sharepoint-proxy org-browse gate deployed live: the
  `userIsSystemAdmin` gate on the org-level browse actions
  (`list_sites`/`list_drives`/`list_children`/`get_file_meta`) — committed in
  `a8ef505c` but only on the Vercel frontend branch — was deployed to the live
  edge function via the Supabase MCP (`sharepoint-proxy` v6, `verify_jwt` true).
  Verified the live function body now contains the gate; behavior for
  per-project actions (`sync_folder`) is unchanged.

- 2026-05-26 per-project-role UI gating: `usePermissions().can()` now resolves
  the effective role from the user's role in the ACTIVE project
  (`useProjectRole`/`useProjectId`) instead of only the global account role, with
  a global-admin override and a global-role fallback when no project is active.
  Display-only — RLS + `workflowEngine.validateTransition` remain authoritative
  (commit `89d8c302`).

- 2026-05-26 feature + enterprise pass: scheduling ("Update Scheduled Dates"
  sync button + drag-to-resize Gantt bars); SOV import hardening (XLSX + steel
  cost-code auto-mapping + pre-import review modal; migration `20260526140000`
  adds `cost_code`/`cost_code_name` to `sov_items`); CO workflow (convert
  cost-impact RFIs → change orders + SOV-line link; migration `20260526150000`
  adds `source_rfi_id`/`sov_line_item_id`/`sov_line_number` to `change_orders`);
  DB scale pass (migration `20260526160000` = 43 covering indexes for unindexed
  FKs + 4 duplicate-index drops; `20260526170000` = 4 `auth_rls_initplan` policy
  wraps); Sentry error monitoring (`src/instrument.js`, masked replay); module
  trim (removed Project Control Center, Portfolio Schedule, Drawing Analysis,
  Meetings, Mitigations, 3D Model Viewer; relocated Onboarding/Data Exchange/
  Integrations/User Management/Feature Flags/Tutorial into Settings); re-landed
  the previously-unpushed financial-correctness fix (signed deductive-CO amount +
  CSV "closed" → neutral status).

- RBAC Phase C project-member management resolved: migration
  `20260516012000_resolve_project_members_phase_c.sql` adds the
  `member_activity` audit table, logs `user_projects` membership adds,
  role changes, and removals from a database trigger, aligns
  `user_projects` RLS with both system-admin and per-project-admin
  management, and gives system admins project-picker read access. The
  Project Members page now allows system admins and per-project admins
  through the page-level gate, supports bulk role updates, shows recent
  member activity, and continues to add only existing `user_profiles`
  users until email invite infrastructure exists.

- `permissions.js` silent-deny resolved in RBAC Phase B: `fetchUserRole`
  now looks up `user_profiles.id` instead of the nonexistent
  `user_profiles.user_id`, so `usePermissions.can()` no longer falls
  through to `"viewer"` for every authenticated user.

- Bypass-able localStorage admin gating resolved in RBAC Phase B:
  `src/hooks/useProjectRole.ts` reads per-project roles through the
  SECURITY DEFINER `get_my_project_role(uuid)` RPC; RLS on protected
  drawing workflows uses `user_has_project_role_at_least(project_id,
  'admin')`; and `'owner'` remains a level-3 synonym for `'admin'`.
  LocalStorage roles remain only as a legacy fallback for screens with no
  active project.

- AI extraction reconciler scheduling resolved: migration
  `20260516003546_enable_ai_extraction_pg_cron.sql` installs
  `pg_cron` and schedules `public.reconcile_stuck_extractions()` every
  5 minutes. Production verification found 0 stale `Extracting` rows
  before enabling the schedule.

- Existing `pdf_page=1` rows after the thumbnail bug are now classified
  as a known data-reupload cleanup, not active code debt. The product
  fix remains in place for new uploads, the manual `PDF Page` editor
  remains available, and production still has candidate legacy rows
  that require reupload or explicit sheet-by-sheet correction rather
  than an unsafe guessed backfill.

- Main worktree hygiene items resolved: the nested
  `C:\dev\SteelBuild-Pro-Rev.2\SteelBuild-Pro-Rev.2\` directory is no
  longer present, and no active locked-window issue reproduced during
  the current cleanup pass.

- Drawings schema/stage cleanup resolved: migration
  `20260516001543_resolve_drawings_tech_debt.sql` drops the dead
  `drawings.annotations` column, backfills pre-077 analysis-stage
  values to canonical stages, tightens the `drawing_analyses`
  stage CHECK, and adds a `NOT VALID` check so new `drawings` rows
  must carry `drawing_set_id`.

- Legacy workflow-stage aliases resolved: active UI/tool references now
  use the canonical `Not Started -> IFA -> OFA -> BFA -> OFS -> IFC ->
  Released` flow, and `src/lib/drawingEnums.js` /
  `src/lib/importAnalyzedDrawings.js` no longer coerce pre-077 stage
  strings.

- Submittal pipeline rollup duplication resolved:
  `src/pages/dashboard/projectMetrics.js` now exposes only the canonical
  `submittalPipelineRollupFromSubmittals` path; the legacy mixed
  drawings/submittals rollup was removed after confirming no live
  callers remained.

- `schedule-assistant` LLM gateway bypass resolved: the edge function
  now keeps JWT verification, RLS-scoped schedule tool execution, and
  `ai_audit_log` writes locally, but routes every model turn through
  `llm-proxy` with `useCase: "schedule-assist"`. Token usage, latency,
  cost, and failures are now visible through `llm_telemetry`, and
  provider/model changes live in `supabase/functions/llm-proxy/router.ts`.

- Supabase generated types / typecheck drift resolved: `npm run typecheck`
  and `npm run typecheck:js` are passing, and CI treats both checks as
  blocking.

- 3D viewer camera snap-back during zoom fixed via component-level refs,
  `infinityDolly` disabled, and `workPackages` staleTime increased.

- Drawings stage workflow corrected in migration 077:
  `Not Started -> IFA -> OFA -> BFA -> OFS -> IFC -> Released`.

- Thumbnail bug fixed: multi-sheet PDFs now correctly assign `pdf_page`
  per drawing.

- Submittal-driven workflow source of truth resolved: KPIs, Stage
  Pipeline, and group headers all read from submittals instead of
  `drawings.stage`.

- Auto-lock trigger re-pointed from `set_approval_status` to submittal
  terminal-approved status.

- Lock, sign-off, and markup status resolved in migrations 071/072/073.

- Component-rendering test infrastructure added: React Testing Library
  and jsdom are wired in. Smoke tests for Layout, Drawings, and
  Submittals live in `src/__tests__/components/`. Default vitest env
  stays `node` for pure-helper suites; component tests opt into jsdom
  with `// @vitest-environment jsdom`. See `ARCHITECTURE.md` Testing.
