# SteelBuild Pro — Claude Workflow Rules

## Auto-deploy after every feature / fix

After landing **any** new feature or bug fix, automatically deploy without
waiting for the user to ask. We work directly on the deploy branch:

1. Run `npm run build` and confirm it exits clean.
2. Commit the change with a clear, descriptive message.
3. `git push origin codex/base44-deploy-nick`.
4. Report the commit hash in the summary.

If a build fails or a push is rejected, **stop and ask** before doing anything
destructive (force push, reset --hard, etc.).

## Branches

- **Working + deploy branch**: `codex/base44-deploy-nick` (Vercel auto-deploys
  from this). All work happens directly here — no separate feature branches.
- Never push to `main` or any other branch without explicit permission.

## Build / package notes

- Vite + React. Build command: `npm run build`. Output: `dist/`.
- 3D viewer (`src/pages/ModelViewer.jsx`) uses `@thatopen/components` v3.4.6.
  `FragmentsManager.init()` **requires** a worker URL — we serve it from
  `public/thatopen/fragments-worker.mjs`. If you upgrade
  `@thatopen/fragments`, re-copy
  `node_modules/@thatopen/fragments/dist/Worker/worker.mjs` to that path.
- PDF viewer (`src/pages/DrawingViewer.jsx`) defaults to a browser-native
  `<iframe>` for reliability; pdfjs canvas mode is available via the toolbar
  toggle for cases that need it.
