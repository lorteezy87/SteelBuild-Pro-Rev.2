# Technical Debt

Living list of known issues, follow-ups, and "we'll fix it later" items.
Each entry has a clear remediation path so future contributors know
exactly what's needed.

---

## Active items

### Stale Supabase generated types
**Where:** `src/types/supabase.ts`
**What:** Missing rows for `submittal_rounds` and possibly other tables
added in migrations after the file was last regenerated. Causes
`npm run typecheck` to fail with `Type '"submittal_rounds"' does not
satisfy the constraint`.
**Impact:** TypeScript check is currently non-blocking in CI
(`continue-on-error: true` in `.github/workflows/ci.yml`). Build still
passes; runtime works fine. Just lose static-typing safety on a few
tables.
**Fix:** Run `npm run types:db` with the Supabase CLI authenticated.
Then flip the CI step back to blocking.

### Bypass-able admin gating (localStorage roles)
**Where:** `src/components/shared/useAppSecurity.jsx`
**What:** Roles stored in localStorage (`sbp_app_roles` key). RLS only
checks project membership, not role. A determined user with project
access could bypass UI gating and hit Supabase directly.
**Impact:** Adequate for trusted internal users, vulnerable to
motivated insiders. Lock writes, sign-off voids, and admin operations
all flow through this gate.
**Fix:** Add `role` column to `user_projects` (`admin` / `pm` /
`field` / `viewer`); add a `user_has_project_role(project_id, role)`
RLS helper; update RLS policies on sensitive tables to check it.
~1 sprint.

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

### `drawings.annotations` legacy jsonb field
**Where:** `drawings.annotations` column (jsonb)
**What:** Old markup field from before `drawings.markup` (current
canonical field). `useMarkup.js` only writes to `markup`, but
`annotations` may still be read in some places.
**Impact:** Unknown — may be dead. Should audit consumers.
**Fix:** Audit all references to `annotations`. If dead, drop the
column in a future migration. Keep `markup`.

### Workflow legacy stages preserved (BFS, FFF)
**Where:** `src/lib/drawingEnums.js` alias map; `importAnalyzedDrawings.js`
**What:** Migration 077 dropped BFS and FFF from
`drawings.stage` CHECK constraint and backfilled 3 FFF rows to IFC.
The JS coercion layer keeps an alias map (`bfs` → `BFA`, `fff` → `IFC`)
so any in-flight code path passing the old strings doesn't crash.
**Impact:** None — defensive. But long-term the aliases can be
removed once we're confident no caller still passes them.
**Fix:** Audit code paths in 6 months. If grep for "BFS" / "FFF"
returns only the alias map and tests, remove the aliases and the
import in `importAnalyzedDrawings.js`.

### `submittals.status` rollup uses two derivation paths
**Where:** `src/pages/dashboard/projectMetrics.js`
**What:** `submittalPipelineRollup` (legacy, accepts mixed
drawings+submittals input) and `submittalPipelineRollupFromSubmittals`
(new, canonical) both exist. Both use the same status→stage mapping
internally but the legacy one is needed for back-compat.
**Impact:** None — both produce identical results for the same input.
**Fix:** Once all callers migrate to
`submittalPipelineRollupFromSubmittals`, delete the legacy variant.

### `drawings.drawing_set_id` is nullable (audit shows 0 NULLs)
**Where:** `drawings` schema
**What:** Column allows NULL. Sprint 2 considered making it NOT NULL
but deferred since the audit showed 0 active NULL rows.
**Impact:** None today, but future legacy/imported rows could create
orphans.
**Fix:** Add `NOT VALID` CHECK constraint requiring non-NULL on new
rows; let historical rows skate. Migration when ready.

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
