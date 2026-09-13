# SteelBuild Pro Rev. 2 — frontend audit and repair pass

Target: **lorteezy87/SteelBuild-Pro-Rev.2**, base `1b1ef4d58`, branch `codex/rev2-frontend-repairs`.
SteelBuild-Pro-2026 was read as a design/workflow reference only. No files in that repository were changed. Existing Rev. 2 data, routes, approval rules, release gates, and integrations remain authoritative.

## Scope and evidence

This is an app-wide source audit with focused implementation and rendered verification. The route registry was inventoried in `frontend-route-inventory.json`. Inspected families: startup/theme/navigation; detailing, drawings, submittals and viewer; Dashboard/portfolio; scheduling, RFIs, Piece Register/fabrication/logistics; Field Hub/Today and QC; contract/change-order/budget/expense/pay-application; documents/photos; settings, organization members, reports and integrations.

Source coverage is not authenticated browser acceptance of every page. Rendered checks cover the modified shell/public routes, real Drawings/Submittals pages with controlled entity reads, and the real submittal list/detail components. Local fixtures use placeholder configuration, intercept external requests, and do not write customer records. Browser plugin unavailable; repository Playwright used. Database migrations, live RLS, authenticated production workflows, native builds and deployment were not exercised.

## Repaired in this pass

| Issue | User-visible repair | Evidence |
|---|---|---|
| Startup import errors bypassed React boundaries | Application loading now occurs beneath a mounted recovery boundary; invalid configuration shows Reload page | Blank-config Vite and bundled production browser tests, desktop/mobile |
| Initial screen ignored system light mode | Prepaint theme/background match saved or OS preference; updated exact CSP script hash | Browser checks with script held before execution, stored/system/invalid/denied preferences |
| Theme initializer crashed when browser storage was unavailable | Deferred guarded storage access and safe absent-matchMedia handling | ThemeProvider regression tests |
| Failed drawing reads looked like an empty register | Required drawings/RFI/submittal/set reads gate counts and controls with loading/error/Retry | Four failed-source tests, paused-offline test, real-page browser retry |
| Failed or incomplete submittal reads looked empty or ready | Wait for all required workflow reads; surface failures; preserve selected-record link until recovery | Eight failed-source tests, delayed-round test, deep-link recovery, real-page browser retry |
| Detailing readiness could be calculated from failed source reads | Core evidence failures/initial pending reads gate the workflow and fleet health; Retry reloads dependencies | Six source-failure cases in real hub; existing hub/routing tests |
| Mobile submittal register was squeezed to 1px by 480px detail | Desktop retains split view; mobile shows list then detail, Back to register, reachable actions, focus transfer | 390px and1440px browser list→detail→Edit/Advance→Back; responsive component tests |
| Closed mobile drawer retained invisible keyboard targets | Closed drawer inert; opening focuses inside, Tab wraps, Escape restores trigger; groups keyboard-operable | Four keyboard/dismissal/scroll regression tests |
| Dashboard request failure cleared selected project | Clear unavailable project only after a successful authoritative project-list response | Error, successful missing, successful present regression cases |
| Contract edit draft survived project switch | Changing project closes and clears the previous contract draft | Rendered project-A→B form regression; update callback checked |
| Zero QC passing specimens changed to one | Preserve explicit zero; retain existing numeric input validation | Real form submit regression plus invalid-quantity cases |

The merged 2026-style compact detailing header, tab navigation, holds, validation and transmittal surfaces are retained. This pass improves their failure recovery and mobile usability rather than replacing the product.

## Additional verified repairs

| Issue | User-visible repair | Evidence |
|---|---|---|
| Schedule and Field Today inferred no tasks/risk from unavailable data | Explicit selection/loading/error states; Schedule preserves record links until recovery | Required-source failures, offline pending and deep-link regression tests |
| Field Hub inferred no safety issues from unavailable sources | Gate aggregate claims on all required reads | Failed-source recovery tests |
| Portfolio Overview showed Healthy/Under budget without financial evidence | Wait for required reads and gate dependent export | Cost and expense failures/retry; delayed data tests |
| Pay-app retainage captured an initial 0% before contract arrival | New draft initializes from loaded contract; cancellation/project switch resets draft | Delayed-contract and project-switch regression tests |
| Organization roster failures looked empty with seats available | Gate member/invite counts and controls until both reads succeed, including offline pause | Failures/retry, initial pending and paused-offline tests |
| Expense summary contradicted failed table/financial reads | Gate counts and controls on required expense/cost-code reads | Failure and delayed-read tests |
| Desktop sidebar ignored saved start preferences | Share canonical rail state across sidebar variants; retain manual toggles and temporary tablet rail | Preference/reload tests and real-browser fixture |
| Operations decision rows could only be clicked | Enter/Space activation with keyboard focus | Schedule and Field Hub keyboard tests |
| Enabled submittal drawing-type read failures appeared empty | Gate optional evidence when feature is enabled; Retry restores register | Component failure/retry, pending and flag-disabled no-fetch tests |

Independent review found and corrected the Team offline-pending case and Field Today offline-capture regression. Photo/punch capture and cached-task progress remain accessible during failed or paused reads; unavailable totals and cached records are identified explicitly. Regression tests exercise actual offline outbox handlers. Re-review found no remaining actionable defects in the changed paths.

## Remaining acceptance limits

- All 76 registered routes were inventoried and the application families above received a source audit. This is not an authenticated click-through of every route.
- Browser fixtures verify actual components/pages with controlled reads, not live Supabase roles, RLS or customer records.
- No database migrations, production mutations, merge or deployment performed in this repair pass.
- Production build retains existing large-chunk warnings. This pass does not claim a performance rework or native acceptance.

## Verification

- Full Vitest suite: **5,988 tests passed across 634 files**.
- Foundation Playwright: **18 passed**, desktop and mobile, including invalid configuration, chunk recovery and prepaint theme behavior.
- Additional rendered checks: actual Drawings/Submittals failure → Retry → confirmed empty at 390px/1440px; submittal list → detail → Edit/Advance callback → Back with focus preserved; sidebar startup preference, manual toggle and reload persistence.
- Built-production missing-configuration recovery: passed desktop/mobile.
- Lint, no-new-JS, TypeScript, JavaScript, strict-null and noImplicitAny gates: passed (zero enforced diagnostics; existing ratchet exclusions unchanged).
- Production build: passed; existing large-chunk warnings remain.
- Production bundles checked for local fixture strings: no matches.
- Independent review completed and identified corrections verified.

Five inherited routing assertions were updated to match the already-merged target-set URL contract. Production routing was not changed for those assertions; the routing suite passed all 78 cases.

Local test logs/screenshots are saved under the workspace `outputs/` directory. Rendered field offline cases use component tests with controlled network failures; they do not establish live offline sync acceptance against production.
