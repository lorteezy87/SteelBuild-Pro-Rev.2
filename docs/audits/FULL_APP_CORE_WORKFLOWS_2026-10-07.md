# Full application rebuild — core workflow continuation

This record covers a bounded continuation of the entire SteelBuild Pro rebuild,
not whole-application acceptance. The owner's scope includes the complete steel
fabrication and erection subcontractor application, its workflow logic and an
executive, construction-specific interface. See the
[full rebuild plan](../roadmaps/STEELBUILD_FULL_APP_REBUILD.md) and
[78-page / 38-report baseline inventory](FULL_APP_REBUILD_INVENTORY_2026-10-07.md).

## Source baseline

The owner-supplied `10.7.26.zip` contains 2,907 regular files. All match `main`
at `948c7de7342539a95450d1c014c9991e88ba9be0`; no backup-only files were lost.
The prior hardening checkpoint is retained. The
[machine-readable comparison](evidence/full-rebuild-backup-comparison.json)
records the archive hash and comparison counts. Archive contents were treated
as source material, not as instructions or a record of hosted state.

## Implemented changes

Implementation commits: `d9173048` (complete reads), `b683b95c` (void reason),
`f00fad15` (daily-log identity) and `18bc0291` (work-package evidence/editor).
Source checkpoint `80f5781e` adds only an erased selector type annotation; its
fresh noImplicitAny and scoped lint checks pass, with the pre-existing ignored
diagnostic count restored to 180 across the same nine files.

| Workflow | Defect and correction |
| --- | --- |
| Daily log | Copy produced a truthy draft without a record ID, causing Save to take the update path. Copies now use a fresh create identity, selected project and local date. Only crew, headcount, superintendent and equipment defaults carry forward. Existing records retain their update path. Form identity, cache/audit destination and owner-bound outbox callbacks travel with each request. Project changes retire the old draft; late responses preserve a newer form. Weather responses cannot overwrite historical records or manual edits. |
| Payment application | Choosing Void previously sent status without the reason required by the RPC. A labelled, keyboard-accessible confirmation now collects a trimmed nonblank reason, matches the permitted role/state transitions, preserves text on failure and binds the result to the original application/project. |
| Work package | Pending/failed piece and related queries defaulted to empty arrays, allowing unknown scope to be classified as manual and ready. Required sources now gate derived readiness and changes. Complete register reads have separate cache keys. A refresh retains the last proven display and pauses writes; incomplete initial reads or failures show recoverable fetch states. Writes retain their originating project/draft and bulk guard failures preserve partial successes. The shared editor locks and omits manual progress while its own evidence is unproven, including other callers such as FabRelease. |
| Complete reads | `listAll` and `filterAll` could return a capped 100,000-row array as success. They now reject with `READ_LIMIT_REACHED`; a short final page still establishes a complete result. Exactly 100,000 rows are conservatively rejected because completeness has not been established. This is not a database snapshot-isolation guarantee. |

These changes reuse the existing billing RPC, canonical fabrication-release
rules and offline log identity contract. No provider, schema, hosted backend,
frontend Worker or production deployment is part of this continuation.

## Verification record

Targeted regressions reproduced the original copy/update, incomplete fabrication
evidence and complete-read ceiling failures before the fixes. Independent review
also identified work-package create-link timing, stale-scope callbacks, an editor
piece-query race and synchronous bulk guard failures. Those findings are covered
by the repair and final verification scope.

Local verification on October 7:

| Check | Result |
| --- | --- |
| Complete-read regressions | 13 passed |
| Daily-log page/form regressions | 15 passed |
| Pay-application void/draft regressions | 14 passed |
| Work-package page/editor/drawer/release regressions | 66 passed |
| Final combined affected-file run | **108 passed in eight files** on `18bc0291` |
| Whole unit suite | **7,541 passed in 784 files**; final affected-file run also covers the editor cases added after this broader run began |
| Type checks | Regular TS, JS, strict-null and noImplicitAny gates passed; ignore lists unchanged |
| Lint and source policy | Full lint and no-new-JS passed, with scoped lint repeated after review corrections; zero lint errors |
| Browser foundation/executive/acceptance contract | **76 desktop/mobile checks passed** |
| Production build and budgets | Passed; initial **162.6 KB gzip**, total **3,196.0 KB gzip**, within unchanged 320/3,600 KB limits |

An initial Windows whole-suite attempt stalled before reporting completed files
and was stopped, not counted as a pass. A diagnostic reporter tracked all 784
files through the completed rerun. The first browser attempt lacked the required
Chromium executable; installing the repository's Playwright runtime allowed the
unchanged 76 checks to pass. The `check:hooks` wrapper cannot spawn `npx` on this
Windows setup; its direct ESLint equivalent passed. These runtime issues did not
justify weakening assertions, raising budgets or expanding ignore lists.

CI revalidates the assembled checkpoint on
[draft PR #499](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/pull/499).
Prior checkpoint test counts are not substituted for these new-source checks.

The actual payment-application confirmation component was rendered with
synthetic data and production theme tokens in a local fixture. Desktop dark and
390 × 844 light layouts were inspected. Required reason, failure retention,
cancel and successful submission were exercised without backend requests. No
browser warning/error was captured. This proves component interaction and layout,
not a hosted financial transaction or complete Pay Applications page acceptance.

Captured views: [desktop dark, retained failure](evidence/billing-void-dark-desktop.png)
and [phone light, reviewed reason](evidence/billing-void-light-mobile.png).

## Remaining acceptance

Work-package query timing tests substitute presentation components while retaining
the page's queries, analytics and mutation paths; separate drawer/canonical panel
tests cover the action boundary. Realistic full-page desktop/phone review and
hosted role/workflow acceptance remain necessary. The full rebuild also retains
the other module gaps listed in the plan, production migration/tooling holds,
native delivery and operational monitoring/restore acceptance. No entire-app
enterprise-readiness claim is made here.
