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

### Pg_cron not installed for AI extraction reconciler
**Where:** Migration `076_ai_extraction_reconciler.sql`
**What:** The `reconcile_stuck_extractions()` function exists and is
callable, but the pg_cron schedule was conditional on the extension
being installed. The extension is *available* on Supabase but not
*installed*.
**Impact:** Drawings stuck in `Extracting` status for >5 minutes won't
auto-reset until either (a) `CREATE EXTENSION pg_cron;` is run on the
project, or (b) an edge function is wired to call the reconciler on
a schedule.
**Fix:** Pick one of (a) or (b). (a) is simpler if your Supabase plan
permits the extension.

### Existing pdf_page=1 rows after thumbnail bug fix
**Where:** Production data — ~380 drawings across multiple sets.
**What:** Pre-fix uploads assigned `pdf_page=1` to every sheet in a
multi-sheet PDF, so thumbnails and viewer renders show the wrong page.
The bug is fixed for new uploads (deterministic
`pdf_page = index + 1` for one-sheet-per-page case, plus a manual
override field on `SheetFormModal`), but existing rows still have the
wrong values.
**Impact:** Affected sheets show the cover page in the viewer; user
must manually click each one and use the new "PDF Page" input on
SheetFormModal to enter the correct page number, OR re-upload the set.
**Fix:** No automated backfill — the LLM extraction would need to
re-run on the source PDF for each set. Per user direction
("I will reupload"), users handle this themselves on a per-set basis.

### Locked windows in main worktree
**Where:** `C:\dev\SteelBuild-Pro-Rev.2\` working tree (Windows)
**What:** Several directories (`src/components/workflow/`,
`src/entities/`, `src/components/constraints/`) are locked by an
unidentified Windows process when stash operations run, producing
"failed to remove" warnings. Stash itself succeeds; warnings are
harmless.
**Impact:** Cosmetic. Deploy dance still works.
**Fix:** Identify and close the process holding the lock (likely a
file watcher or open editor). Or move to using only the worktree
path for all git operations.

### Stray nested directory in main worktree
**Where:** `C:\dev\SteelBuild-Pro-Rev.2\SteelBuild-Pro-Rev.2\`
**What:** A nested copy of the project, likely created by a paste
artifact. Contains stale snapshots of files that don't match what's
in git.
**Impact:** Confusing — "is this real?" — but doesn't affect builds
or deploys.
**Fix:** Delete the nested directory after confirming nothing
important lives only there.

---

## Recently-resolved (last 30 days, kept here for context)

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
