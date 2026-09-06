# SteelBuild Pro — Claude Workflow Rules

## How production actually deploys

`steelbuild-pro.com` ships via a gated GitHub Actions pipeline defined in
`.github/workflows/ci.yml` — **not** Vercel's own git auto-deploy:

- The `ci` job (ESLint, TypeScript, Vitest, `npm run build`) runs on every
  push to `main`/`master`/`staging`/`claude/**` and on every pull request.
- The `deploy` job runs **only** on a push to `main`, gated on `ci` passing.
  It does `vercel pull --environment=production` (pulling the Production env
  vars configured on the `steelbuildpro-og` Vercel project), then
  `vercel build --prod`, then `vercel deploy --prebuilt --prod`.
- Vercel's own git auto-deploy is disabled for `main`
  (`vercel.json` → `git.deploymentEnabled.main=false`) — this GitHub Action is
  the **only** path to production. Because it's a prebuilt deploy, env vars
  are baked in during the Actions build step: fixing a missing/wrong env var
  requires setting it in the Vercel dashboard *and* triggering a fresh CI run
  on `main` (new commit, or re-run the workflow) — clicking "Redeploy" in the
  Vercel dashboard just re-serves the old bundle and fixes nothing.
- A separate `steelbuild-pro-staging` Vercel project has git auto-deploy
  **on** and generates a live preview URL for any pushed branch (including
  `claude/**`), so a feature branch gets a working preview without merging
  anything.
- `codex/base44-deploy-nick` is **not** wired to any current deployment
  (confirmed via the Vercel API — it appears in neither project's domain/alias
  list as of 2026-09-06). Treat it as legacy; merging into it ships nothing.

## Auto-deploy after every feature / fix

After landing a fix or feature on the current feature branch (whatever
`git branch --show-current` reports, e.g. `claude/infallible-mcnulty-1685e1` —
never hardcode it):

1. Run `npm run build` and confirm it exits clean.
2. Commit with a clear, descriptive message and push to the current feature
   branch. This alone triggers CI plus a live Vercel preview — no merge
   needed for the user to see it working.
3. Do **not** merge into or push `main` yourself. `main` is production with no
   gate beyond CI, and pushing to it requires **explicit permission** from the
   user (a merge there deploys immediately). Instead, tell the user the branch
   is built, tested, and pushed, and ask whether to open a PR into `main` now.
4. If the user confirms, open (or point them to) a PR from the feature branch
   into `main`. Once they merge it, the GitHub Actions pipeline deploys
   automatically — no further action needed from you.

If a build fails, a push is rejected, or a merge conflict needs judgment
beyond "take feature branch", **stop and ask** before doing anything
destructive (force push, reset --hard, etc.).

## Branches

- **Feature work**: whatever branch the worktree is currently on. Each Claude
  worktree gets its own `claude/<slug>` branch — use that, don't reuse a stale
  one from a different worktree.
- **Production**: `main`, deployed via the gated GitHub Actions pipeline
  above. Never push to `main` without explicit permission — merging there
  deploys immediately.
- `codex/base44-deploy-nick`: legacy, not connected to any live deployment as
  of 2026-09-06.

## Build / package notes

- Vite + React. Build command: `npm run build`. Output: `dist/`.
- 3D viewer (`src/pages/ModelViewer.jsx`) uses `@thatopen/components` v3.4.0.
  `FragmentsManager.init()` **requires** a worker URL — we serve it from
  `public/thatopen/fragments-worker.mjs`. If you upgrade
  `@thatopen/fragments`, re-copy
  `node_modules/@thatopen/fragments/dist/Worker/worker.mjs` to that path.
- PDF viewer (`src/pages/DrawingViewer.jsx`) defaults to a browser-native
  `<iframe>` for reliability; pdfjs canvas mode is available via the toolbar
  toggle for cases that need it.
