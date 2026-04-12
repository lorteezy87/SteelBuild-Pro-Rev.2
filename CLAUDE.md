# SteelBuild Pro — Claude Workflow Rules

## Auto-deploy after every feature / fix

After landing **any** new feature or bug fix on the active feature branch
(`claude/sleepy-bassi-aAHPF`), automatically deploy without waiting for the
user to ask:

1. Run `npm run build` and confirm it exits clean.
2. Commit the change with a clear, descriptive message and push to
   `claude/sleepy-bassi-aAHPF`.
3. `git checkout codex/base44-deploy-nick`, `git pull`, then
   `git merge claude/sleepy-bassi-aAHPF`. Resolve conflicts by preferring the
   feature-branch version unless context says otherwise.
4. Run `npm install` if `package.json` / `package-lock.json` changed, then
   `npm run build` again on the deploy branch and confirm clean.
5. `git push origin codex/base44-deploy-nick`.
6. `git checkout claude/sleepy-bassi-aAHPF` so the working tree is back on
   the feature branch.
7. Report both commit hashes (feature + deploy merge) in the summary.

If a build fails, a push is rejected, or a merge conflict needs judgment beyond
"take feature branch", **stop and ask** before doing anything destructive
(force push, reset --hard, etc.).

## Branches

- **Feature work**: `claude/sleepy-bassi-aAHPF`
- **Deploy target**: `codex/base44-deploy-nick` (Vercel auto-deploys from this)
- Never push to `main` or any other branch without explicit permission.

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
