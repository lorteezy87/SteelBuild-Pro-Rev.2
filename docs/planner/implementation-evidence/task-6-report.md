# Task 6 report — Planner shell, toolbar, and action register

## Scope completed

- Added the canonical Planner shell, full approved navigation configuration, and route-compatible workspace chrome.
- Added a reusable semantic action register and compact native-control toolbar.
- Added stable action-register columns and pure row-tone helpers.
- Replaced the Planner CSS scaffold with reference-aligned tokens, fixed navy top/left chrome, pale canvas, compact controls, sticky rail/table headers, urgency row tints, focus states, and narrow-width horizontal table scrolling.
- Added the Task 6 shell and register component contracts.

## RED evidence

`npx vitest run planner/src/components` was run immediately after writing the two new test files and before implementation.

- `PlannerShell.test.tsx` failed because `../PlannerShell` did not exist.
- `ActionRegister.test.tsx` failed because `../ActionRegister` did not exist.

The first implementation run additionally exposed missing root-Vite alias support for Planner-local component tests. The components now use local relative imports, so the exact brief command works without changing global test configuration.

The full Planner suite then exposed the existing safe-not-found contract (`Planner page not found` must remain an `h1`) after shell composition changed it to an `h2`. The failing existing test was retained as the regression contract and the heading was restored to `h1`.

## GREEN validation

- `npx vitest run planner/src/components` — PASS, 2 files / 4 tests.
- `npm run test:planner` — PASS, 8 files / 47 tests.
- `npm run typecheck:planner` — PASS.
- `npm run build:planner` — PASS. Vite reports the pre-existing-style chunk-size advisory: the emitted JavaScript bundle is 524.28 kB minified.
- `npm run lint -- --quiet planner/src/components planner/src/app/PlannerRoutes.tsx` — PASS.

## Screen / fidelity evidence

- The accepted visual reference was inspected directly: `C:\Users\Nicholas\AppData\Local\Temp\codex-clipboard-79db13b1-b736-4f39-86a6-9f24054a48c0.png`.
- Build output confirms the Planner CSS and route bundle compile successfully.
- Local browser startup at `http://127.0.0.1:5173/48-hour-gate` was blocked before rendering by the shared authentication client. Browser console evidence: `VITE_SUPABASE_URL is missing` and `VITE_SUPABASE_ANON_KEY is missing`.
- Therefore no authenticated desktop or narrow-width runtime screenshot was claimed or saved. The narrow-width behavior is covered structurally by the CSS contract: the rail remains fixed while the main grid preserves a minimum content width and the semantic table stays intact inside `overflow-x: auto`.

## Limits and follow-up boundary

- No credentials were fabricated, no authentication path was bypassed, and no local `.env.local` was created.
- The register is intentionally presentation-only in this task: it accepts actions, filters, selection, and callbacks, but no core page data workflow was added or changed.
- No staging, commit, push, deploy, migration, or unrelated-file edit was performed.

## Fix Round 1 — route completion, overflow containment, and valid brand markup

### RED evidence

Three test-first assertions failed before this fix:

- `/task-register` rendered only the generic heading, so the route had no toolbar, table, empty state, or local filter behavior.
- `planner.css` forced `body { min-width: 56rem; }` and the narrow media grid used `minmax(44rem, 1fr)`, both allowing page-level horizontal overflow.
- `.planner-brand__identity` was a `span`, which wrapped the `h1` and produced invalid HTML.

### Fix delivered

- `/task-register` now mounts `PlannerShell` plus `ActionRegister` with an honest immutable empty action dataset and local filter/selection state.
- The semantic empty table and native toolbar remain available. `New Task`, `Complete Selected`, and `Export` are disabled and expose accessible explanations that their Task 7 workflows are not connected; no fake records or success actions were added.
- All other approved Planner routes use a clear coming-next message rather than claiming workflow completion.
- Removed document-level width forcing. Shell/main tracks now allow shrinking, while only `.planner-register__scroll` owns horizontal overflow around the semantic table.
- Replaced the brand identity wrapper with a `div`.

### GREEN validation

- Focused fix contracts: 3 files / 18 tests PASS.
- `npx vitest run planner/src/components`: 2 files / 4 tests PASS.
- `npm run test:planner`: 9 files / 49 tests PASS.
- `npm run typecheck:planner`: PASS.
- `npm run build:planner`: PASS. The JavaScript bundle is 531.72 kB minified; Vite emitted its standard chunk-size advisory.
- The repository ESLint config intentionally only matches `src/**`, so direct `npm run lint -- … planner/...` reports Planner files as unmatched. A temporary, non-retained Planner-scoped flat config ran `react-hooks/rules-of-hooks`, `unused-imports/no-unused-imports`, and `@typescript-eslint/no-explicit-any` over Task 6 source: PASS.
- `git diff --check`: PASS; it printed only CRLF advisories for unrelated pre-existing tracked changes.

### Current limits

- Runtime visual verification remains blocked by the same missing local Supabase environment variables. No visual viewport result is claimed for this fix round.
- No stage, commit, push, deploy, migration, or permanent lint-configuration change was made.

### Follow-up TDD check

After the first fix-round GREEN pass, one further failing route assertion required the disabled `Complete Selected` control to identify its Task 7 boundary explicitly, not merely the empty-register selection condition. The reusable register now supports a caller-supplied disabled reason, the Task Register route supplies the Task 7 completion reason, and the final focused route test passes (15/15).

## Fix Round 2 — preserve sticky chrome without a clipping scroll container

### RED evidence

The strengthened Planner responsive CSS contract failed because `.planner-shell` set `overflow: hidden` and `.planner-main` set `overflow-x: hidden`. Either ancestor can become or suppress the sticky scroll context.

### Fix and GREEN validation

- Removed only those two overflow declarations. `.planner-shell` retains `width: 100%`, `max-width: 100%`, and grid sizing; `.planner-main` retains `min-width: 0`.
- `.planner-register__scroll` remains the sole horizontal scrolling boundary with `max-width: 100%` and `overflow-x: auto`.
- The CSS contract now also asserts sticky topbar/sidebar plus the absence of every visible overflow mode (`hidden`, `auto`, `scroll`, `clip`) on the shell and main regions: PASS, 1/1.
- `npx vitest run planner/src/components`: PASS, 2 files / 4 tests.
- `npm run test:planner`: PASS, 9 files / 49 tests.
- `npm run typecheck:planner`: PASS.
- `npm run build:planner`: PASS. Vite retains the 531.72 kB chunk-size advisory.
- Temporary Planner-scoped lint config: PASS; it was deleted immediately after use because the repository ESLint config does not target `planner/**`.
- `git diff --check`: PASS with only unrelated CRLF advisories.

No Task 7 behavior, commit, push, deploy, migration, or permanent lint configuration change was made.
