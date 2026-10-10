# Protected calculator viewport acceptance — source candidate

This runner exercises `/CalculatorsHub?calc_tab=cranepick` through a real authenticated staging session. It does not evaluate a lift, create a pick, certify an engineering calculation, or write project records. Source preparation and local synthetic verification are not hosted acceptance or a production-readiness claim.

## Protected execution

`calculator-acceptance.yml` accepts only an exact candidate SHA. Dispatch must come from main, the candidate must be its ancestor, and the candidate must have all four source jobs successful together in one completed push CI run: application, secret scan, Edge typecheck, and commercial PostgreSQL acceptance. The credential-consuming job uses the main-restricted `staging-backend` environment. It builds the exact candidate locally and serves only `127.0.0.1:4173`.

The existing reviewed drawing setup is reused without modification: real password authentication, normalized expiry, fixed staging public-key validation, exact active organization/project identity checks, actual app project-cache ownership, and project selection. It never obtains an administrative key or creates an account. The calculator spec rechecks the selected organization/project and exact route query.

The context network guard, including its local bounded telemetry discard, and runtime/network health probe are also unchanged. Service workers and WebSockets remain blocked; provider/Edge/write requests and redirects remain forbidden. The calculator adds no network permissions. Its chart library, history, and packaged Three.js scene are local features. Sidebar expansion is local-only. Theme/account preferences, imports, exports, printing, saving, and history creation/clearing are not performed.

## Six required profiles

| Profile | Viewport | Required shell/layout |
|---|---|---|
| desktop | 1440 × 900 | Expanded sidebar; two calculator columns |
| sidebar-constrained | 1100 × 800 | Expanded sidebar; actual calculator width below 980; stacked columns |
| tablet | 820 × 1180 | Forced sidebar rail; stacked columns |
| phone-360 | 360 × 852 | Phone shell; stacked columns |
| phone-393 | 393 × 852 | Phone shell; stacked columns |
| phone-430 | 430 × 932 | Phone shell; stacked columns |

Each case requires the actual calculator title, active Crane Pick tool, blank piece-weight input, planning disclaimer, empty history, and disabled summary action. A fitting login/error page cannot pass. The test expands the reference and ground-bearing sections, checks every visible calculator control, exercises the real 3D view controls and hide/show behavior, and opens/closes the empty device-local crane library. No engineering input values are entered.

Geometry checks enforce document/main/topbar horizontal fit, available-width layout, and visible control bounds. Center/edge hit tests detect clipping inside overflow-hidden cards and covered actions; trial clicks check enabled controls without activation. Rounded corners are intentionally tested at edge midpoints, not inside their cutaway corners. Disabled summary controls still require visible, unclipped bounds.

The actual canvas must expose a live WebGL context. Only the explicit application fallback, without additional console/runtime/network failures, is classified `INCOMPLETE`; it still produces a nonzero exit. Missing/broken canvases and other failures are `FAIL`. Six successful cases are required for `PASS`; missing, skipped, interrupted, duplicate or unknown profiles cannot qualify. Only the authenticated account's existing theme is exercised; this runner does not claim both themes or native iOS GPU coverage.

## Artifacts and privacy

At most four fixed screenshot names per profile cover initial content, actions, 3D, and the library. Images are cropped to calculator/dialog content, never account identity chrome; each is bounded to the viewport and 2 MiB. Automatic failure screenshots, full-page capture, trace, video, auth state, logs and response payloads are not uploaded. The workflow retains only these PNGs and a summary for seven days.

The summary contains a validated candidate SHA, fixed target/mode, finite profile/stage/outcome fields and the reviewed closed setup diagnostic categories. `failedSetupTelemetryDiscarded` describes failed setup only, not successful setup or case traffic. Raw errors, DOM labels, input values, stacks, stdout and attachments never enter the summary.

## Local verification

- **34** executed workflow-gate and sanitized reporter tests passed.
- **9** real browser contract tests passed, including clipped/covered actions, a vertically reachable control, rounded/disabled buttons, login/error rejection and unavailable-versus-broken WebGL classification. The rounded-button regression first failed against the initial corner probe, then passed after the correction while genuine clipping still failed as intended.
- Actual `tsconfig.scripts.json` NodeNext check passed. A separate strict NodeNext check with browser DOM types includes every new E2E module and both configurations; no repository compiler settings were weakened.
- Scoped ESLint and `git diff --check` passed. Dedicated discovery lists six cases; general discovery excludes the new directory with one precise ignore entry.
- All six local production-render cases passed using the actual built application and synthetic, intercepted API fixtures. The build was candidate `04285069c26c8e57c59b491cd202be6100a01b79`; calculator, shell, navigation and responsive source were confirmed byte-identical to approved base `e6deddd309ce577d0d5f7ca780d97dd71c317d4c`. This diagnosis harness contains synthetic auth only and is ignored; it is not a hosted login substitute or deployed acceptance evidence. The local renderer used real WebGL, produced 24 cropped images (approximately 15–80 KiB each), and screenshots were visually inspected.

Commands for committed checks:

```text
node node_modules/vitest/vitest.mjs run scripts/__tests__/calculatorAcceptanceGate.test.ts scripts/__tests__/calculatorAcceptanceReporter.test.ts
node node_modules/playwright/cli.js test --config playwright.calculator-contract.config.ts
node node_modules/typescript/bin/tsc -p tsconfig.scripts.json
node node_modules/playwright/cli.js test --config playwright.calculator-acceptance.config.ts --list --reporter=list
```

No hosted dispatch occurred while preparing this candidate. Combined source CI, main merge and exact-SHA protected staging execution remain required before recording authenticated acceptance.
