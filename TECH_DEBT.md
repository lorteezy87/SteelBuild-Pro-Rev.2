# Technical Debt

Living list of known issues, follow-ups, and "we'll fix it later" items.
Each entry has a clear remediation path so future contributors know
exactly what's needed.

---

## Active items

_No active items currently tracked._

---

## Recently-resolved (last 30 days, kept here for context)

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
