# Task 10 implementation evidence

## Result

Task 10 is complete in the local working tree. The Planner deployment contract, owner runbook, built-preview browser coverage, responsive shell, authentication exit boundary, and service-worker cache-write regression are implemented and locally validated.

No files were staged or committed. No branch was pushed, no Vercel project was changed, and no Supabase migration was applied.

## Delivered files

- `vercel.planner.json` — named CLI-only Planner build/output configuration, immutable hashed assets, no-cache service-worker/manifest headers, main-app-aligned security headers, asset/service-worker rewrite exclusions, and boolean `git.deploymentEnabled: false`.
- `.env.example` — browser-safe Planner URL/hostname variables; no service-role variable.
- `docs/runbooks/planner-pwa.md` — local build/preview commands, required public environment values, Supabase Auth redirect owner steps, separate Vercel project setup, migration order, PWA checks, cache-version rules, rollback, and explicit service-role prohibition.
- `planner/index.html` — explicit `/planner-icon.svg` favicon so the Planner document does not fall back to `/favicon.ico`.
- `playwright.planner.config.ts` and `e2e/planner-core.spec.ts` — deterministic mocked-Supabase built-preview verification at desktop, tablet, and mobile viewports, including the boolean deployment guard and explicit icon boundary.
- `planner/src/app/PlannerSessionContext.ts`, `planner/src/app/PlannerAuthGate.tsx`, and its test — Planner-local authenticated session surface and an explicit no-user sign-out boundary.
- `planner/src/components/shell/PlannerShell.tsx` and `planner/src/styles/planner.css` — signed-in identity/actions plus a mobile drawer with Menu, Escape, and link-close behavior.
- `planner/public/sw.js` and `planner/src/offline/__tests__/serviceWorker.test.ts` — service-worker hashed-asset cache writes are awaited before the fetch response completes.
- `vite.config.js` — excludes the independently configured `planner/**` test tree from the root Vitest run. `npm run test:planner` remains authoritative for those tests.

Generated visual evidence is present locally under `output/playwright/planner-core/` (`desktop.png`, `tablet.png`, and `mobile.png`) and remains untracked.

## TDD evidence

1. Deployment test failed first with `ENOENT .../vercel.planner.json`; it passed after the dedicated Vercel contract was added.
2. The service-worker test failed because the hashed-asset `cache.put` was fire-and-forget. The focused regression passed after the write became awaited: 4/4 service-worker tests.
3. Mobile browser verification failed because no `Open Planner navigation` control existed. It passed after the mobile drawer was implemented.
4. Sign-out browser verification failed because `PlannerAuthGate` only checked `authError`, leaving a shell with no authenticated user. It passed after the gate required an authenticated identity.
5. The focused auth/shell/service-worker set passed: 3 files, 22 tests.

### Fix round 1 — final deployment review

The final review found two Task 10 contract gaps and one runbook accuracy gap.
They were corrected without expanding Planner scope:

- RED: the targeted browser contract expected
  `git.deploymentEnabled === false` but received the branch map
  `{ main: false, staging: false }`.
- RED: the built Planner document had no `link[rel="icon"]`, so the expected
  `/planner-icon.svg` favicon boundary was absent.
- GREEN: after the minimal config and HTML changes, the targeted deployment and
  unauthenticated-document checks passed 2/2. The request audit also confirmed
  that navigation did not request `/favicon.ico`.
- The runbook now states that `vercel.planner.json` is a named CLI-only config.
  The root `vercel.json` belongs to the main app. Owners must create/link the
  dedicated Planner project without Git integration (or disconnect/disable it)
  and deploy/rebuild only with `--local-config vercel.planner.json`.
- Fix-round validation passed: full Playwright 3/3, Planner tests 116/116,
  Planner typecheck, lint, main build, Planner build, and `git diff --check`.

## Complete core gate

Commands were run in the required order.

| Command | Result |
| --- | --- |
| `npm run test:planner` | PASS — 21 files, 116 tests |
| `npm run typecheck:planner` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run typecheck:js` | PASS |
| `npm run typecheck:strict` | PASS — 81 errors in one grandfathered file ignored, 0 enforced errors |
| `npm run typecheck:noimplicitany` | PASS — 173 errors in 10 grandfathered files ignored, 0 enforced errors |
| `npm test` | FAIL / bounded stop — 2 unrelated Resource Scheduling failures, then no further output for about 55 seconds |
| `npm run build` | PASS — 4,399 modules, built in 39.98s |
| `npm run build:planner` | PASS — 520 modules, built in 6.78s |

The full repository gate is therefore **not claimed as passing**. A focused repro of the root failure completed with 27 passing and 2 failing tests in `src/pages/resourceScheduling/__tests__/resourceSchedulingHelpers.test.ts`:

- `positions a bar from scheduled dates with a minimum width of 2 days`: expected `{ left: 40, width: 20, duration: 1 }`, received `{ left: 37, width: 20, duration: 1 }`.
- `falls back to released_date as start`: expected `left` 20, received 17.

These failures are outside Planner Task 10 and were not modified. The main build emitted its existing `>500 kB` chunk warning. The Planner build emitted two non-fatal warnings: the shared Supabase module is both statically and dynamically imported, and the 539.99 kB entry chunk exceeds Vite's 500 kB advisory threshold.

## Browser and PWA verification

`npx playwright test --config playwright.planner.config.ts` passed 3/3 tests against the built Planner preview in 16.0 seconds.

Verified with deterministic local Supabase fixtures:

- unauthenticated sign-in boundary and authenticated Task Register load;
- New Task creation and explicit date confirmation;
- filter, exact bulk completion, 48-Hour Gate, archive, and sign out;
- local storage and IndexedDB cleanup after sign out;
- install manifest, active service-worker scope `/`, shell/bootstrap cache entries, and cached-data labeling;
- desktop, tablet, and mobile rendering, including mobile Menu and Escape close;
- zero unhandled fixture requests, page errors, or browser console errors.

No dedicated staging credentials were provided, so remote authentication/data access was not exercised. Playwright's `context.setOffline()` rejected both a cold navigation and a controlled fetch before the active service worker could respond in this environment. Consequently, **cold offline relaunch is not claimed as verified**. The test does verify the active registration, cache storage containing shell HTML and bootstrap JavaScript, and the cached-data banner. A real installed-browser/device offline relaunch remains an owner staging check in the runbook.

## Visual fidelity review

The accepted desktop reference was compared directly with the final desktop, tablet, and mobile screenshots.

1. **Shell geometry:** the final top bar is approximately 48 px high and the desktop rail is 168 px, close to the reference's roughly 157 px rail.
2. **Navigation density:** both use a dense, grouped rail. A few long final labels wrap where the reference is slightly tighter; navigation remains readable and operable.
3. **Toolbar:** the final register exposes New Task, Complete Selected, selection count, Export, Project, Workstream, Status, and Search. This preserves the reference's action/filter hierarchy; Export is positioned later and Workstream is additionally visible.
4. **Table and row density:** the final register uses a compact semantic table with a sticky navy header. The accepted image shows a taller, multi-row light-header treatment and much more populated sample data. The local fixture intentionally renders one created row, so fixture volume was not mistaken for a layout defect.
5. **Palette and risk treatment:** navy, light gray, teal, and amber align with the reference direction. Critical/watch risk tint tokens remain in the stylesheet; the final captured row is neutral because the critical fixture was archived during the workflow.
6. **Typography:** Barlow headings, Inter body copy, and IBM Plex Mono for dense tabular/numeric content preserve the accepted hierarchy and construction-control tone.
7. **Responsive behavior:** tablet retains the navigation rail. Mobile converts it to an explicit drawer, keeps Sign out available, and preserves the wide register through horizontal scrolling rather than compressing operational columns into unreadable content.

No material visual mismatch warranted a broad Task 10 redesign.

## Owner actions and limitations

- Apply the existing Planner migrations in the runbook order with the approved migration workflow; they remain local/unapplied.
- Configure Supabase Auth redirect URLs for the eventual preview and production domains.
- Create/link a separate Vercel project without a Git connection (or disconnect/disable Git in project settings), add only browser-safe environment variables, and perform the runbook's authenticated staging/PWA checks. The named `vercel.planner.json` is CLI-only; the root `vercel.json` belongs to the main app and must not govern Planner.
- Verify installed-device cold offline relaunch and upgrade behavior before production rollout.
- Deployment and rollback remain owner actions. Planner deploys must use `--local-config vercel.planner.json`; never use a bare CLI deploy that would read the main app's root `vercel.json`. The config's boolean Git guard does not replace disconnecting/disabling Git integration on the dedicated project.

## Repository state

Task 10 changes are uncommitted. The generated `output/` screenshot directory is untracked. The two Resource Scheduling test failures and bounded root-suite stall remain unresolved, unrelated repository baseline conditions.
