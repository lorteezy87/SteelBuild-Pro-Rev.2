# Steel executive workspace and reliability release

Date: 2026-10-07. Base: `948c7de7342539a95450d1c014c9991e88ba9be0`.
Branch: `codex/steel-executive-hardening`.

## Continuation: security and the first intelligence increment

The continuation adds a calculated execution brief to the live Command Center. All six source families must load completely, remain in the selected project, and stay below the pagination safety cap. The brief uses the existing calendar horizons, links to source records, reports owner/date gaps, and distinguishes refreshing/error states from a complete snapshot. It adds no model connection or autonomous action. [Intelligence delivery sequence](../roadmaps/STEELBUILD_INTELLIGENCE.md).

Offline field replay now binds captures to the original user/workspace, holds the original token, and checks cancellation at the actual SDK transport boundary. Account changes, workspace-generation changes and unmount stop later requests, retries, queue reconciliation and stale success messages. The existing client_op_id deduplication remains intact. Legacy ownerless captures require recovery before the existing sign-out purge; see [local ownership and retention](../runbooks/local-data-ownership.md).

The server MFA candidate covers authenticated REST/RPC, private Storage operations, currently published Realtime tables, and seven user-facing Edge endpoints. The browser challenge also waits for the verified profile before opening the app. The candidate has isolated PostgreSQL, real-handler and Deno checks; hosted enforcement remains pending the reviewed release. [Exact backend candidate and observed deployed versions](BACKEND_RELEASE_CANDIDATE_2026-10-07.md).

The complete dependency audit improves from 16 findings to five inherited from one unpatched upstream Braces vulnerability. Production dependencies remain at zero advisories and zero waivers. [Compatibility and audit evidence](DEPENDENCY_TOOLCHAIN_2026-10-07.md).

Browser acceptance now requires authenticated main content, complete project context, successful scoped API responses and actual fixture rows. Login pages, error states and forbidden data writes cannot count as success. Synthetic checks are separate from real authenticated staging acceptance.

![Calculated execution brief, synthetic desktop records](evidence/command-center-brief-dark-desktop.png)

[Field-phone light-theme brief](evidence/command-brief-light-mobile.png). These captures show the shipped component with synthetic records; they do not establish backend deployment or live-account acceptance.

## Product scope

This release keeps SteelBuild Pro focused on structural-steel subcontractors. The project dashboard emphasizes engineering approvals, fabrication and logistics, field readiness, and commercial exposure. It retains the canonical piece-control panel and fabrication-release rules.

The executive presentation uses the existing light/dark theme and accent preferences, a clear project masthead, operating metrics, four workstream entry points, an actionable priority queue, a project brief, and recent activity. Its layout adapts to desktop, tablet, and field-phone widths. Keyboard focus and reduced-motion preferences remain supported. Small light-theme text uses stronger contrast, and the preview loads the same font families as the production entry.

## Corrections included

- Dashboard workstream and attention actions resolve canonical page names and legacy aliases through one typed navigation boundary.
- Health displays an operational condition and incomplete-evidence status rather than presenting a synthetic health number as a measured result.
- Priority totals and risk counts use the entire collection before the eight-row preview is selected.
- Dashboard and scorecard use approved, allocated change orders in revised budgets, including deductive changes.
- Canonical cost exposure compares actuals and commitments within each cost code before summing. Actual-only shop costs cannot disappear behind unrelated field commitments. Unmapped expenses enter once; voided expenses stay excluded.
- Earned-value TCPI uses remaining work divided by remaining budget. SPI requires planned value rather than treating the entire budget as work planned to date.
- Piece-control station completions and work-package groups use indexed lookups while retaining leaf-piece and completion-deduplication rules.
- Pay Applications overrides an inherited list selector for its single-project query.
- RFI numbering and persistence share one validated project scope; a mismatched active project is rejected before allocating a number.
- Dashboard, Portfolio Hub, and Executive View query only the active workspace, paginate child rows in bounded project batches, and show failures instead of partial financial totals. Initially offline reads remain pending, and the 100,000-row safety cap produces an explicit error.
- Cached project lists carry user/workspace ownership. Workspace changes clear prior query data before children open.
- Notes and local action history use account/workspace storage keys. Unknown-owner legacy notes remain preserved and unread, with recovery documented in `docs/runbooks/local-data-ownership.md`.
- Failed sign-out preserves the current session and drafts while displaying a persistent retryable alert; it does not claim successful logout when the SDK retains credentials.
- The MFA boundary handles initial checks, returned errors, and stale asynchronous results. Verified same-session refreshes preserve mounted forms; a new sign-in remains gated.
- Compatible locked security updates also cover brace-expansion, DOMPurify, smol-toml, and source-map-js.
- Capacitor core/iOS and the CLI minimum move to 8.5.1. The committed Swift package pin matches the official 8.5.1 tag.

## Original verification record

Application source commit `50bf16059315b48fac77c8c4f555244e805c9580` passed the complete application job in [run 37586115974](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37586115974/job/112676512617):

| Check | Result |
|---|---|
| ESLint and new-source TypeScript policy | Passed |
| TypeScript, JavaScript, strict-null, and implicit-any gates | All passed |
| Vitest | 7,364 tests in 774 files passed |
| Browser acceptance | 22 tests passed, desktop and mobile; executive cases also checked tablet width |
| Database helper search paths | Eight helpers; 3,929 unchanged-result cases; isolation and rollback checks passed |
| Account deletion authorization | Role, archive, removed-member, and timeout checks passed |
| Production build | Passed |
| Existing bundle budgets | Passed: initial 162.8 KB gzip / 320 KB limit; total 3,190.6 KB gzip / 3,600 KB limit |
| Secret scan and Edge Function typecheck | Passed |
| Production dependency audit | Zero advisories and zero waivers |
| All-dependency audit and production drift | Failed on the existing release holds below |

The unchanged application baseline passed 7,235 tests in 760 files and 18 browser checks in [run 37580582816](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37580582816). The release adds 129 unit regressions and four browser scenarios without waiving checks.

The actual executive dashboard was rendered with synthetic records in both themes at desktop and mobile widths, and at tablet width within the desktop scenarios. Keyboard actions resolved the command center, work-package, and RFI routes. No page errors, backend requests, or horizontal page overflow were observed. This fixture does not establish authenticated-backend acceptance.

[Full-page screenshots and browser evidence](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37586115974/artifacts/11466532781) are retained by CI for seven days. The viewport captures below are also checked into this report's evidence folder. They were visually inspected; they show synthetic records and development preview controls.

| Desktop | Field phone |
|---|---|
| [Dark theme](evidence/executive-dark-desktop.jpg) | [Dark theme](evidence/executive-dark-mobile.jpg) |
| [Light theme](evidence/executive-light-desktop.jpg) | [Light theme](evidence/executive-light-mobile.jpg) |

![Executive dashboard in dark mode](evidence/executive-dark-desktop.jpg)

Local process execution and interactive browser control were unavailable because the desktop sandbox failed before startup. CI provided executable validation and rendered screenshots. After the successful run, the final evidence commit changes only this report, screenshot files, coordination metadata, and removal of the temporary screenshot-log export. Application code and permanent checks remain the verified versions.

## Release holds

This is an application improvement release, not an enterprise certification or authorization to deploy. Keep the following holds visible:

1. **Production database compatibility:** the existing drift gate identifies required versions `20260922015713`, `20260927150000`, `20260927160000`, and `20261005100745` as missing remotely. Follow the repository's reviewed, manually stamped backend-release process. Do not bypass the gate or run an automatic migration push against shared production.
2. **Dependency audit:** the continuation reduces the complete audit to five high findings in the unpatched Braces/Tailwind development dependency chain; production remains at zero. None are waived. A framework upgrade requires its own compatibility validation.
3. **Server MFA:** the tested candidate migration `20261007073051` and seven guarded Edge functions require reviewed staging application and hosted AAL1/AAL2 verification before production release. The new version is a fifth required missing migration; browser gating alone is not authorization.
4. **Active-workspace acceptance:** the three portfolio entry points are now scoped and have regression coverage. Run authenticated staging acceptance with a real two-workspace member, including related records and upload destination.
5. **Legacy local content and offline sessions:** existing ownerless notes and field captures require the documented owner-reviewed recovery process. New replay is isolated by account/workspace and original token. Recover confirmed legacy captures before the existing logout/account-switch purge. Failed offline sign-out is reported honestly; offline credential eviction is not implemented, and local storage is not encrypted or a substitute for server audit/backup. Photo record deduplication can still leave an extra uploaded object after a lost response; cleanup requires reference/retention review.
6. **Native release:** resolve Swift dependencies and build/test the iOS app on macOS after syncing Capacitor. A web build does not validate native delivery or distribute the security patch to installed apps.
7. **Operational acceptance:** verify staging role boundaries, representative project volumes, monitoring alerts, backup restoration, and business-owner acceptance of drawing release, piece progress, billing, and change-order workflows.

The database, deployed Edge Functions, production site, and main branch were not modified by this release.

## Acceptance scenarios

- An executive opens a project with overdue RFIs, held work packages, a delayed steel delivery, and an aging change order. Counts and severity remain correct beyond the eight-row preview, and each action opens its intended register.
- A project with shop actuals of $900 and separate field commitments of $900 reports $1,800 exposure. Approved allocated additions/deductions change the revised budget consistently.
- A foreman and office user can use the dashboard by keyboard and on a narrow screen in either theme without horizontal page overflow.
- A user switches between organizations while old requests are in flight. The previous project's data does not render inside the new workspace.
- Initial MFA verification or a failed assurance lookup cannot expose the authenticated app. A same-session refresh preserves an in-progress form.
- A portfolio RFI create uses the chosen project's official number sequence and saves to that same project; an active-project mismatch fails before numbering.
