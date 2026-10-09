# Drawing acceptance browser setup diagnosis — 2026-10-09

## Observed hosted failure

The first protected read-only drawing run, [37949854746](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37949854746), used main candidate `04285069c26c8e57c59b491cd202be6100a01b79`. It failed in global setup after about 4.7 seconds with zero executed cases. The retained summary records `setupFailureStages: ["browser"]`; there are no case screenshots. Authentication and exact staging parent validation completed. The coordinator's staging HTTP review found successful authentication and application reads, without HTTP errors in that interval.

This failed run remains failed. The local reproduction below is evidence for a runner correction, **not authenticated hosted acceptance**. Neither the read-only rerun nor the synthetic PDF workflow was dispatched while preparing this correction.

## Local reproduction and cause

Built the actual candidate's application source with its staging URL, a clearly synthetic publishable-key value, empty `VITE_SENTRY_DSN`, and candidate version. No real credentials were used. An ignored local Playwright harness served that production build on `127.0.0.1:4173`, seeded a synthetic session, and fulfilled only policy-approved staging reads with synthetic user/profile/organization/project rows. All application assets, page rendering, project cache ownership checks, picker interactions, and acceptance health probes were real.

The empty Sentry environment value does not disable telemetry: `src/instrument.js` falls back to its checked-in public DSN. The strict browser guard aborted POSTs to that DSN's envelope endpoint. Chromium produced console errors from those deliberately blocked requests. The actual `observeReadOnlyPage` health assertion then failed, despite a successfully loaded Projects page, owned project cache, and selected STG-0001 project.

Before correction, this local flow failed at the probe health assertion in about two seconds, with three console-error observations. After the local discard below, the same built application and fixtures passed all setup interactions and both health assertions (one local reproduction case, 8.0 seconds including server startup). No console errors were suppressed. Separate real-browser tests confirmed that closing staging Realtime and canceling a prior page's local asset during navigation do not themselves cause that probe failure.

The local fixture harness was a diagnosis aid and is ignored, not an authenticated acceptance artifact. The committed browser contracts exercise the correction without real credentials or provider traffic.

## Narrow correction and privacy boundary

The shared browser guard locally fulfills only POST/OPTIONS requests to exactly:

`https://o4511458803253248.ingest.us.sentry.io/api/4511458819375104/envelope/`

It returns 204 without reading request bodies or headers, forwarding a request, retaining an envelope, or contacting the telemetry service. The ordinary egress predicate still rejects that endpoint. Each context permits at most 64 local discards, within the existing 1,000-request total limit; excess attempts fail acceptance. Other Sentry endpoints, HTTP methods, providers, Edge functions, writes, redirects, and WebSocket connections retain their original denial rules. A DSN change requires an explicit reviewed policy change.

Both drawing runners and the synthetic PDF browser phases use this shared guard. The separate scoped Node transport for synthetic writes is unchanged. Product telemetry configuration is unchanged by this slice; the coordinator's separate Replay/log containment change is independent.

Setup now distinguishes closed browser substeps (launch, context, navigation, session injection, main content, cache, picker, health, state persistence). Failure summaries retain only allowlisted error categories and a bounded `failedSetupTelemetryDiscarded` count. They never serialize raw exception text, console messages, stack traces, response bodies, URLs, query strings, tokens, or auth state. The count describes failed setup only; successful setup and per-case discard counts are not retained. The original `browser` stage remains readable for historical summaries.

## Verification

- Focused guard, reporter privacy, and source-gate tests: **67 passed**.
- Real Playwright browser contracts: **22 passed**, desktop and mobile. A rejecting loopback proxy observed zero requests while the exact envelope fetch received a local 204. Separate controlled console and runtime faults still failed the actual read-only health probe. Existing direct-provider, popup, redirect, WebSocket, and Node sign-in redirect denial tests remained green.
- Actual scripts gate: `node node_modules/typescript/bin/tsc -p tsconfig.scripts.json` passed, including NodeNext import resolution.
- Scoped test ESLint and `git diff --check` passed.
- The candidate production build passed before the reproduction. No application source changed in this slice, so that build was reused for the RED/GREEN comparison.

Commands for the committed checks:

```text
node node_modules/vitest/vitest.mjs run scripts/__tests__/stagingNetworkGuard.test.ts scripts/__tests__/drawingEvidenceReporter.test.ts scripts/__tests__/drawingEvidenceAcceptanceGate.test.ts
node node_modules/playwright/cli.js test staging-network.contract.spec.ts --config playwright.foundation.config.ts
node node_modules/typescript/bin/tsc -p tsconfig.scripts.json
```

Next release evidence still requires combined source CI, main ancestry and same-SHA gates, followed by protected authenticated staging acceptance. There is no new production-readiness claim here.
