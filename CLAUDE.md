# SteelBuild Pro — Claude Workflow Rules

Conventions for agent-driven development on this repo. For the system
shape (architecture, auth, RBAC, workflow), read
[`ARCHITECTURE.md`](./ARCHITECTURE.md). For known issues + fix paths,
read [`TECH_DEBT.md`](./TECH_DEBT.md).

---

## Shell — use PowerShell, NOT Bash

This is a Windows box and the Bash tool's working directory is flaky
(intermittent `No such file or directory` on the CWD). **Use the
PowerShell tool for every shell command** — git, npm, builds, deploys.
All recent work shipped through PowerShell.

Patterns that work:
```powershell
Set-Location "<repo-or-worktree-path>"; node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 5; Write-Host "EXIT: $LASTEXITCODE"
Set-Location "<path>"; npx vitest run 2>&1 | Select-String -Pattern "Tests|Test Files" | Select-Object -Last 3
```

For multi-line commit messages, write a temp file then `-F` it (avoids
PowerShell here-string escaping issues). Use the `Write` tool to create
the temp file so it has no UTF-8 BOM (PowerShell's `Out-File -Encoding utf8`
adds a BOM that leaks into the commit subject):
```powershell
git commit -F .git-commit-msg.tmp; Remove-Item .git-commit-msg.tmp
```
`.git-commit-msg.tmp` is gitignored. Don't `git add -A` while other
agents share the worktree — stage explicit paths only.

## Build command

`node ./node_modules/vite/bin/vite.js build` — call vite directly. `npm
run build` sometimes swallows output through the PowerShell pipe; calling
vite directly returns a reliable exit code. Output: `dist/`.

Always finish with `Write-Host "EXIT: $LASTEXITCODE"` so you can confirm
exit 0.

## Branches & deploy

- **Deploy branch**: `codex/base44-deploy-nick`. Vercel auto-deploys from
  it. Production URL: https://steelbuild-pro.vercel.app
- **Agent worktrees**: agent sessions run in a git worktree on a
  `claude/<slug>` feature branch under `.claude/worktrees/`. These get
  auto-cleaned when the session ends — push your branch before relying
  on it surviving.
- Never push to `main` without explicit permission.

### Deploy workflow

**If you're in the main checkout on `codex/base44-deploy-nick`** (e.g.
direct doc edits): build → commit → `git push origin
codex/base44-deploy-nick`. Report the SHA.

**If you're on a `claude/*` feature branch in a worktree**: push the
feature branch, then run the merge dance from the **main worktree**
(`C:\dev\SteelBuild-Pro-Rev.2`):
```powershell
Set-Location "C:\dev\SteelBuild-Pro-Rev.2"
git stash push -u -m "WIP-before-merge"     # main worktree often has uncommitted work
git checkout -- .                            # clears tracked files left by Windows file-lock warnings
git pull origin codex/base44-deploy-nick
git merge claude/<slug> --no-edit
node ./node_modules/vite/bin/vite.js build   # verify clean
git push origin codex/base44-deploy-nick
git stash pop                                # restore the WIP
```
Windows "failed to remove ... Permission denied" warnings during stash
are normal (locked dirs) — the stash entry still creates.

If a build fails or a push is rejected, **stop and ask** before doing
anything destructive (force push, reset --hard, etc.).

## Database migrations

- Live Supabase project id: `kjrwqagyeswwoxpjkcko`
- Migrations live in `supabase/migrations/NNN_name.sql`, numbered
  sequentially. **Latest is `081_llm_telemetry`.**
- Apply via the Supabase MCP `apply_migration` tool (NOT the CLI). Drop
  the same SQL into a `supabase/migrations/NNN_*.sql` file so the repo
  history matches the live DB.
- After a migration that adds columns, PostgREST needs the schema
  reloaded — most code paths trigger `NOTIFY pgrst, 'reload schema'`.

## Domain workflow — submittals are the source of truth

The 7-stage detailing flow (migration 077):
```
Not Started → IFA → OFA → BFA → OFS → IFC → Released for Fab
                              ↑
                              └─ R&R (Revise & Resubmit) loops to IFA
```
- IFA = In For Approval, OFA = Out For Approval, BFA = Back From
  Approval, OFS = Out For Scrub, IFC = Issued For Construction.
- **Submittals own workflow status**; `drawings` are document artifacts.
  `drawings.stage` and `drawing_sets.set_approval_status` are deprecated
  for rollups — read `submittals.status` + `ball_in_court` and map via
  `src/lib/submittalStageMapping.js`.
- Auto-lock: when a submittal hits a terminal-approved status, linked
  drawing sets lock (see `useSubmittals.ts` `lockLinkedSetsIfApproved`).

## Theme — SteelBuild Dark

Industrial dark theme is the default. Mechanism:
- `src/styles/steelbuild-dark.css` — self-contained stylesheet, scoped
  under `.steelbuild-dark`, prefixed `--sbd-*` / `.sbd-*`.
- `ThemeContext.jsx` adds `class="steelbuild-dark"` to `<html>`.
- `tokens.css` has a `.steelbuild-dark { ... }` overlay (with
  `!important`) that retargets legacy tokens (`--accent`, `--bg-surface`,
  etc.) at the SBD palette — so existing inline styles flip automatically.
- `tailwind-compat.css` has a `.steelbuild-dark` HSL bridge so shadcn/ui
  components (Dialog, Select, Input, Button, Toast) match.
- For NEW components, use the `.sbd-*` utility classes: `sbd-card` /
  `sbd-card-strong` (glass panels), `sbd-kpi*` (KPI tiles), `sbd-badge-*`
  (status pills), `sbd-table` + `sbd-num` (data tables), `sbd-input` /
  `sbd-select` / `sbd-btn*` (forms/buttons), `sbd-sidebar` / `sbd-topbar`.
- Palette: steel-blue primary (`#56B0FF`), executive-gold secondary
  (`#C89B20`), emerald/amber/rose status. Fonts: Barlow Condensed
  (display) + Inter (body) + IBM Plex Mono (mono/numbers).
- **Do NOT migrate to Tailwind.** The token system is the convention.

## RBAC — DB-enforced

- Two role layers: `user_profiles.role` (global `admin`/`user`, gates
  `<AdminRoute>`) and `user_projects.role` (per-project
  `owner`/`admin`/`pm`/`field`/`viewer`; `owner` ≡ `admin`).
- DB helpers (SECURITY DEFINER): `user_has_project_access`,
  `get_my_project_role`, `user_has_project_role`,
  `user_has_project_role_at_least`, `user_is_project_admin`.
- Front-end: `useProjectRole(projectId)`, `useAppSecurity().isAdmin`.
- Admin UI: `/ProjectMembers` to manage roles; `/FeatureFlagsAdmin` for
  flags.

## Feature flags

Homegrown `feature_flags` table. `useFlag("flag_key")` returns bool;
per-email overrides supported. Toggle at `/FeatureFlagsAdmin`.

## LLM gateway

All LLM calls route through the `llm-proxy` Supabase edge function,
which picks a provider per `useCase` (router in
`supabase/functions/llm-proxy/router.ts`). Telemetry logs to the
`llm_telemetry` table. After editing the edge function, deploy it
manually:
```
supabase functions deploy llm-proxy --no-verify-jwt
```
(`--no-verify-jwt` is required — the function does its own JWT check.)

## CI

`.github/workflows/ci.yml` runs lint + typecheck + Vitest + build on
every push/PR. TypeScript is currently non-blocking (stale
`src/types/supabase.ts` — run `npm run types:db` to regenerate, then
flip it to blocking).

## Build / package notes

- Vite + React. 532+ Vitest tests; keep them green.
- 3D viewer (`src/pages/ModelViewer.jsx`) uses `@thatopen/components`
  **v3.4.1**. `FragmentsManager.init()` **requires** a worker URL served
  from `public/thatopen/fragments-worker.mjs`. If you upgrade
  `@thatopen/fragments`, re-copy
  `node_modules/@thatopen/fragments/dist/Worker/worker.mjs` to that path
  — a byte-mismatched worker silently produces zero geometry.
- PDF viewer (`src/pages/DrawingViewer.jsx`) defaults to a browser-native
  `<iframe>`; pdfjs canvas mode is a toolbar toggle.
- Multi-sheet PDFs: each drawing's `pdf_page` must be set correctly or
  thumbnails all show page 1. New uploads handle this; legacy rows need
  re-upload or the manual "PDF Page" field in SheetFormModal.
