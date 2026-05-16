# Technical Debt

Living list of known issues, follow-ups, and "we'll fix it later" items.
Each entry has a clear remediation path so future contributors know
exactly what's needed.

---

## Active items

### Bypass-able admin gating (localStorage roles) — RESOLVED in RBAC Phase B (079/080)
**Where:** `src/components/shared/useAppSecurity.jsx`,
`src/hooks/useProjectRole.ts`, migrations `079_user_project_roles`,
`080_rbac_rls_tightening`.
**What:** Roles are now read from `user_projects.role` via the SECURITY
DEFINER `get_my_project_role(uuid)` RPC (Phase B). RLS on
`drawing_sets`, `drawings`, `drawing_signoffs`, `drawing_zones`,
`drawing_links`, and `drawing_zone_dependencies` consults
`user_has_project_role_at_least(project_id, 'admin')` for delete /
unlock / void / lock-bypass writes. `'owner'` is a synonym for `'admin'`
(level 3) so the existing 15 owner rows keep their full access.
LocalStorage roles still exist as a legacy fallback when there's no
active project (settings, login chrome).
**Remaining (Phase C):** RESOLVED. `src/pages/ProjectMembers.jsx` ships
the per-project member-management UI. System admins (gated via
`<AdminRoute>`) can pick any project, change member roles inline, remove
members, and add existing users by email. Writes go through
`base44.entities.UserProject` and are gated at the DB by the existing
`admins_*` RLS policies on `user_projects` (so even a non-admin who
bypasses the AdminRoute would 42501 on write).

Phase C deferred items (call out as future sprints):
  - **Member-activity audit table.** Role changes are not currently
    logged anywhere — there is no `member_activity` table yet, and the
    existing `drawing_activity` is the wrong shape for membership
    events. Add a dedicated table + write a row from the page when
    role changes / member additions / member removals happen.
  - **Bulk role edits.** Today every change is one row at a time. A
    "select N members, set role to X" path would be useful for
    onboarding a whole subcontractor crew.
  - **Inviting users by email.** Phase C only allows adding *existing*
    `user_profiles` rows. Sending an actual email invite needs email
    infrastructure (Sprint 3 — currently blocked).
  - **Per-project-admin gate.** The page is wrapped in `<AdminRoute>`
    (system admin only). The doc-comment in the page calls out the
    future path: also let `useProjectRole(activeProjectId).role ===
    'admin' | 'owner'` through, scoped to projects they admin.

### permissions.js usePermissions silent-deny — RESOLVED in RBAC Phase B
**Where:** `src/services/permissions.js`
**What:** `fetchUserRole` queried `user_profiles` with
`.eq("user_id", user.id)`, but the table's PK is `id` (mirrors
`auth.users.id`). The lookup always returned null, the hook silently
fell through to `"viewer"`, and `can()` denied every action. Fixed in
the same sprint as 079/080.

---

## Recently-resolved (last 30 days, kept here for context)

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

- ✅ 3D viewer camera snap-back during zoom — fixed via component-level
  refs + disable infinityDolly + bump workPackages staleTime.
- ✅ Drawings stage workflow corrected (Migration 077): Not Started →
  IFA → OFA → BFA → OFS → IFC → Released.
- ✅ Thumbnail bug — multi-sheet PDFs now correctly assign pdf_page
  per drawing.
- ✅ Submittal-driven workflow source of truth — KPIs, Stage Pipeline,
  and group headers all read from submittals (not drawings.stage).
- ✅ Auto-lock trigger re-pointed from `set_approval_status` to
  submittal terminal-approved status.
- ✅ Lock + sign-off + markup status (migrations 071/072/073).
- ✅ Component-rendering test infrastructure — React Testing Library +
  jsdom wired in (May 2026). Smoke tests for Layout, Drawings, Submittals
  in `src/__tests__/components/`. Default vitest env stays `node` for the
  pure-helper suite; component tests opt into jsdom with a
  `// @vitest-environment jsdom` pragma. See ARCHITECTURE.md → Testing.
