# M0 — existing shell verification and recovery

User outcome: open the current app, navigate implemented routes, retain theme,
and recover from load errors without a blank page or automatic reload loop.

## Existing authorities

- `src/boot/AppProviders.jsx`: error/theme/auth/query/outbox/router composition.
- `src/boot/AppRoutes.jsx` + `src/config/routes.js`: canonical routes and shell.
- `src/config/moduleRegistry.js` / `moduleGating.js`: existing availability.
- `src/components/shared/ThemeContext.jsx`: persisted dual-theme choice.
- `src/lib/lazyRetry.ts`: all lazy route imports and stale-asset recovery.
- `src/boot/PageLoader.jsx`: accessible lazy-route progress.
- `.github/workflows/ci.yml`: Cloudflare preview/production jobs depend on CI.

Reuse these equivalents; do not create parallel providers/catalogs. No database,
production configuration, billing, signup or deployment changes belong to this slice.

## Bounded implementation and evidence checklist

- [x] Clean lockfile install and baseline full test suite.
- [x] Reproduce two lazy-load failure modes: a healthy import resetting another
      import's recovery marker, and unavailable storage permitting an unsafe reload.
- [x] Preserve one reload per failed importer across page boots, including when
      other imports succeed. Only recovery of that importer clears its marker.
- [x] If a durable recovery marker cannot be written/read, show the existing
      error boundary instead of reloading. Real application errors are rethrown.
- [x] Public lazy pages use the shared loading indicator and page error boundary,
      including existing case/trailing-slash matching and route-change recovery.
- [x] Rejected lazy imports offer an explicit Reload page action because React
      caches their failure; ordinary render failures keep Retry.
- [x] Exercise the production components in a development-only fixture route;
      exclude fixture modules from the production bundle.
- [x] Unit/interaction tests cover each behavior before implementation.
- [ ] Browser acceptance at 1440px and 390px: route links, theme reload, error
      retry, unknown route, delayed load and failed load recovery. Record fixture
      versus authenticated app evidence separately.
- [x] Lint, four type checks, no-new-JS, full tests and production build.
- [x] Review the bounded diff; record exact remaining M0 acceptance gaps.

Potential external gap: the current CI comments state the former staging host and
Supabase project are unavailable. Recheck actual preview availability and publisher
configuration; do not mark the entire M0 contract verified from local fixtures alone.

## Verified evidence — 2026-09-11

Environment: Node 24.18.0, npm 11.16.0, clean `npm ci` from the existing lockfile;
no dependency version changes. Native build-script approval warnings were emitted
by npm; the installed Vite, Chromium and production build ran successfully.

| Gate | Result |
|---|---|
| Baseline `npm test` at `36a974289` | 4,888 tests / 517 files passed |
| Lazy recovery regression, before fix | 7 expected failures, 8 passes |
| Public route regression, before fix | 3 expected failures, 1 pass |
| Cached rejection recovery regression, before fix | 1 expected failure, 1 pass |
| Targeted recovery after fixes | 21 tests passed |
| Final `npm test` | 4,909 tests / 520 files passed |
| `npm run lint` | Passed |
| `npm run check:no-new-js` | Passed |
| Four type checks | Passed; existing ratchet lists unchanged |
| `npm run build` | Passed with existing large-chunk warnings |
| `npm test --prefix supabase/tests/function-search-path` | Eight pinned helpers; 3,929 unchanged result cases and isolation/idempotency/rollback checks passed |
| `npm run test:e2e:foundation` | 6 checks passed: 1440×900 desktop and 390×844 mobile |
| Production bundle inspection | Fixture entry/markers absent; no matching privileged-key formats or service-role JWTs detected |
| Independent review | Cached-import Retry finding fixed and re-reviewed; no remaining code defects identified |

Browser tooling: the Browser skill/plugin was not available; repository Playwright
was used. The fixture makes no external requests. The real public-page checks use
actual App/providers/routing while blocking external fonts/telemetry and supplying no
auth session. No customer data or production writes are involved.

Browser evidence covers normal content, meaningful loading status during a delayed
real chunk request, theme toggle/persisted reload, keyboard skip-link focus,
link/back navigation, recoverable render errors, and a failed public chunk followed
by exactly one automatic reload and a successful explicit Reload page action.
Expected deliberately injected errors are distinguished from ordinary console/page
errors. Screenshots show no overlay or horizontal clipping in the tested states.

The standalone fixture is served at `/dev/foundation.html` by Vite development only.
It is not a production build input and has a second `import.meta.env.DEV` guard.
CI now runs this browser gate inside `ci`, before the dependent preview/deploy jobs.

## Still required before marking all of M0 verified

- Authenticated shell navigation, unknown-route browser recovery and project-switch
  acceptance on the actual new preview; unit coverage of these existing boot
  behaviors is not a substitute for that signed-in walkthrough.
- Verify live CI/preview for this PR and confirm the effective hosting publisher
  configuration, including whether any provider besides the CI-gated Cloudflare
  workflow can publish the production site. No hosting setting was changed here.
- A disposable development/staging data environment for the following auth module.
  Current GitHub `STAGING_BASE_URL` still names the former Vercel staging host.
  The preview workflow explicitly uses the production Supabase project; it must
  not be treated as a disposable environment for future mutation acceptance.

M0 remains active pending these checks. No M1–M35.1 implementation has begun.
The next action is preview verification, not advancement past the incomplete gate.
