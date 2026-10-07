# Steel executive workspace and reliability release

Date: 2026-10-07. Base: `948c7de7342539a95450d1c014c9991e88ba9be0`.
Branch: `codex/steel-executive-hardening`.

## Product scope

This release keeps SteelBuild Pro focused on structural-steel subcontractors. The project dashboard emphasizes engineering approvals, fabrication and logistics, field readiness, and commercial exposure. It retains the canonical piece-control panel and fabrication-release rules.

The executive presentation uses the existing light/dark theme and accent preferences, a clear project masthead, operating metrics, four workstream entry points, an actionable priority queue, a project brief, and recent activity. Its layout adapts to desktop, tablet, and field-phone widths. Keyboard focus and reduced-motion preferences remain supported.

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
- The MFA boundary handles initial checks, returned errors, and stale asynchronous results. Verified same-session refreshes preserve mounted forms; a new sign-in remains gated.
- Compatible locked security updates also cover brace-expansion, DOMPurify, smol-toml, and source-map-js.
- Capacitor core/iOS and the CLI minimum move to 8.5.1. The committed Swift package pin matches the official 8.5.1 tag.

## Verification record

The unchanged application baseline passed the repository's lint/type gates, 7,235 unit tests in 760 files, 18 foundation browser checks, and a production build in [run 37580582816](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37580582816). This baseline result does not validate the changes above.

Validation of the assembled changes is pending. The release adds financial, navigation, query, account/workspace isolation, and MFA regressions, plus actual-dashboard browser checks in both themes at desktop and mobile widths, with an additional tablet check. Browser screenshots and failure traces are retained as CI artifacts. The development fixture uses synthetic records and does not establish authenticated-backend acceptance.

Local execution and interactive browser inspection were unavailable because the desktop sandbox failed before process startup. Repository CI is the executable validation environment for this work.

## Release holds

This is an application improvement release, not an enterprise certification or authorization to deploy. Keep the following holds visible:

1. **Production database compatibility:** the existing drift gate identifies required versions `20260922015713`, `20260927150000`, `20260927160000`, and `20261005100745` as missing remotely. Follow the repository's reviewed, manually stamped backend-release process. Do not bypass the gate or run an automatic migration push against shared production.
2. **Dependency audit:** the baseline contains additional build/native-tooling advisories. The critical Capacitor runtime patch is included; the final CI report must be reviewed for remaining findings.
3. **Server MFA:** browser gating is not authorization. Verify protected database, Storage, and Edge operations reject an enrolled user's AAL1 token and allow AAL2 through a separately reviewed server enforcement change.
4. **Active-workspace acceptance:** the three portfolio entry points are now scoped and have regression coverage. Run authenticated staging acceptance with a real two-workspace member, including related records and upload destination.
5. **Shared-device local data:** local Notes and destructive-action history still need an ownership-preserving migration. Offline sign-out error behavior requires verification.
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
