# Crane, IFC navigation and severe security remediation — 2026-10-08

This follow-up uses the actual SteelBuild Pro Rev. 2 checkout on
`codex/security-membership-revocation`, starting at `cc522f2e`. It implements the
requested crane graphics and IFC navigation improvements before continuing the
P1 security register. The original shared checkout's unrelated changes remain
separate. Nothing in this package has been deployed or applied to a hosted
database. No customer records, real payment events or backup credentials are
used by its tests.

The [canonical TECH_DEBT register](../../TECH_DEBT.md) remains authoritative.
The [October 7 audit](SECURITY_AUDIT_REGISTER_2026-10-07.md) is the original
assessment snapshot; its open findings are superseded only where this report
records a specific implementation and evidence. This is a bounded remediation
batch, not closure of the whole audit.

Implementation commits on the review branch:

| Area | Commit |
|---|---|
| Crane graphics and IFC navigation | `06bce0c37223414768f8de0a1260f75a85137066` |
| Account identity preservation, atomic billing and backup ref guard | `1fc3078f1af7ef79524654d3640ab7015da465f2` |
| Recovery lifecycle and regression coverage | `037e3b0fd9149f0f351d8eea1ec530598f43974b` |

## Requested product changes

- The crane illustration has a detailed multi-axle carrier, glazed cabs,
  outriggers and pads, telescoping boom, hydraulic ram, counterweights, hoist,
  hook, shackles and structural-steel load. Shared materials and merged geometry
  bound render cost; lighting, shadows and the environment are disposed on
  teardown. Existing crane/load geometry and engineering calculations are
  retained. The generic body remains illustrative and does not establish crane
  capacity, stability or clearance.
- Camera presets include Overview, Crane, Rigging, Elevation and Plan, with
  zoom, fit, expansion and ground-reference controls. The radius ring is a
  geometric reference. Impossible below-grade loads remain visible with an
  explicit warning. Dark/light and phone layouts use existing theme tokens.
- The calculator's `View 3D plan` link opens and scrolls to the existing view.
- `IFC 3D Viewer` is available under Detailing, All Modules, and Ctrl/Cmd+K search
  using IFC, 3D, BIM or model. A project-scoped entry redirects to the existing
  `DrawingSubmittalHub?hub_tab=model3d`, preserving explicit project links and
  active selection. Existing project access and `viewer_3d` gates remain in force;
  no hosted flag has been enabled by this change.

Rendered Playwright Chromium checks used 1440×1000 and 390×844 viewports.
Crane controls, theme changes, invalid geometry recovery and dimension changes
worked without application errors or horizontal overflow. The actual calculator
page also opened/reopened the plan and retained 50% utilization for a synthetic
10,000 lb / 20,000 lb case. Chromium software rendering reported screenshot
readback performance warnings, not application failures.

IFC checks mounted the real navigation, mobile drawer, launcher, search,
keyboard shortcut, project guard and redirect with synthetic contexts. Sidebar,
search and launcher reached the correct project/model tab; mobile navigation
closed after selection and offered a 44px touch target. The destination was an
explicit fixture boundary: these screenshots do not establish real IFC
upload/render behavior, live feature flags, authentication or deployed state.
Existing hub component tests exercise loading/error/disabled flag gates.
The Browser plugin was unavailable; standard Playwright was used.

Local review artifacts are `crane-visual-qa.json`, `crane-page-qa.json`,
`ifc-visual-qa.json`, and their desktop/mobile screenshots in the task's
`outputs` directory. Independent source review found no actionable regression
in the crane geometry/lifecycle or IFC access/navigation changes.

## EDGE-6 — workspace owners must not delete other people's identities

Workspace erasure no longer counts zero memberships and then deletes supposedly
orphaned Auth users. That unlocked gap allowed membership changes between the
check and deletion. Workspace mode now retains every Auth identity, including
the caller's, and returns `users_deleted: 0`. Only explicit self-account mode
calls `deleteUser(callerId)`. Current ownership, caller-scoped database erasure,
durable cleanup journal and file-cleanup failure behavior are retained.

User-facing copy distinguishes workspace erasure from account deletion.
Workspace file-cleanup failure directs the user to support, rather than into
an unrequested self-account deletion. A deleted workspace's owner lookup still
prevents replaying that workspace-mode request; support recovery from the
journal remains necessary. Explicit account-mode recovery also deletes the
caller's login after cleanup, by design.

Actual-handler regressions failed before the changes and passed afterward.
Coverage includes zero remaining memberships, a concurrent join during file
cleanup, retained caller identity, later caller-only deletion, sole ownership
with teammates, database/journal/file failures and mode-correct error guidance.
This source fix needs no new migration. Existing erasure SQL release
prerequisites and AUTH-8 fresh-reauthentication policy remain separate.

## SBSEC-05 and SBSEC-06 — atomic billing acknowledgement and current entitlement

The handler checks configuration, duplicate-event and organization lookup
errors, and accepts success only after a confirmed atomic RPC result. The
service-only `get_stripe_billing_snapshot` captures the billing revision and
bindings before retrieving current Stripe state. `apply_stripe_billing_event`
locks the organization, rechecks that observation, applies the entitlement,
advances the private revision and records the unique event in one transaction.
It requires exactly one affected organization row. A failed marker write rolls
everything back; changed observations return a retryable failure so the next
delivery retrieves Stripe again. A `23505` is accepted only after verifying
that exact event's durable receipt, never by matching an error message.

Checkout and subscription events share an explicit entitlement policy: one
configured price and active/trialing/past_due status are required for paid
access. Existing past_due grace is preserved. Unknown/ambiguous prices,
unknown/inactive statuses and canceled subscriptions receive no paid plan;
metadata cannot grant one. Fresh provider objects must match the customer and
organization. Old subscription updates/deletions cannot replace the current
binding. Only a checkout for a freshly verified, strictly newer subscription
can replace it; same-second ambiguity fails for reconciliation rather than
guessing. The existing newer-checkout upgrade flow is preserved.

Candidate SQL: `20261008071019_atomic_stripe_billing_events.sql` (SHA-256
`3DFC1339EB999C33B5BAD396D439958C8A6E6820071A612E33E686DB9D5BBE44`). It pins empty
search paths, revokes public/anon/authenticated RPC access, and keeps private
state behind RLS without direct client grants. The manifest classifies it as
required/pending; the drift test continues reporting it missing until applied.
The new SQL suite runs inside the required `ci` job. The dependent handler has
no non-atomic fallback and must not precede its exact reviewed SQL deployment.

Actual-handler tests cover returned database errors, retry, cancellation,
unknown prices/statuses, obsolete/new/ambiguous bindings, customer mismatch,
signature rejection, provider failure and receipt confirmation. Actual SQL
checks cover rollback, affected-row suppression, stale observations, binding
changes, event replay and role grants. Independent review found no actionable
issue in the candidate. PGlite serialization checks do not substitute for
multiple live database connections or signed provider delivery acceptance.

Previously processed receipts remain valid, including legacy rows. The change
does not repair historical failed updates that already received a receipt;
reconcile affected subscriptions deliberately and never bulk-delete receipts.
Existing checkout behavior can create overlapping paid subscriptions; that
product issue is not solved by event-ordering enforcement. No source
subscription-status CHECK was found; actual hosted constraints still need
release verification.

## SBSEC-10 — production backup ref guard

The backup job now admits only main plus schedule/workflow_dispatch. A manual
feature-branch or tag dispatch cannot pass that condition. The runner independently
rejects unsupported Actions contexts before configuration, credential-file
creation or external work. Ten child-process cases exercise that real entrypoint;
the workflow/configuration regression group passes 38 tests.

This is a source correction, not proof of credential isolation. An untrusted
branch can change its own workflow or script. The production environment must
independently restrict branches to main and hold the backup secrets without
repository-level equivalents. The effective hosted policy has not been
verified or changed in this package. A GitHub CLI read could not run because
`gh` is unavailable; no credential workaround was attempted. The runbook records
the remaining condition. See [GitHub environment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
and [job-context evaluation](https://docs.github.com/en/actions/concepts/workflows-and-actions/contexts).

## AUTH-4 — recovery survives reload and ends through confirmed sign-out

The Supabase client records recovery before React mounts. A deny-only store
restores the recovery state after reload; ordinary refresh and identity events
cannot silently dismiss it. The recovery form remains outside project routes,
after the required MFA challenge. Cancel calls real sign-out. Successful
password update retains an updated-password phase until the SDK confirms
sign-out; failed sign-out presents a retry, without releasing the gate.
Ordinary Settings password rotation remains independent of this workflow.

Each recovery lifecycle has its own persistence key. A completion receives an
opaque snapshot of the exact entries it observed and can remove only those
entries, preserving a newer lifecycle even if another tab writes during the
removal. Only this runtime's own callback hint can be bound to a fresh recovery
event; a boot-scanned unresolved entry is never reused for another lifecycle.
Persistence contains no access/refresh tokens. A nonce-only, same-site cookie
backs up failed localStorage writes. Unknown/malformed state retains the hold
and permits finishing sign-out, rather than assuming recovery completed.

Seventy focused tests in six files cover the real provider/router, early SDK
capture, fresh-module reload, returned/thrown sign-out failures, cancellation,
successful reset, stale completion, MFA ordering, ordinary password rotation
and persistence interleavings. Independent review reproduced and verified the
write-failure/new-tab and old-tab-removal/new-tab-creation cases against the
actual helper. Three integration suites using partial browser-location mocks
also passed after bootstrap handling was corrected (60 tests).

This is client workflow containment. A valid Supabase recovery JWT remains an
ordinary authenticated token at the server; this does not restrict its direct
API privileges or retroactively revoke issued JWTs. If both localStorage and
cookies cannot persist, memory and the callback URL contain the current tab
but cannot guarantee a newly opened tab retains the hold. Real hosted and
native callback/MFA acceptance remains necessary. PKCE conversion and fresh
reauthentication policy stay open under AUTH-5 and AUTH-8.

## Validation and release disposition

Final source validation through `037e3b0f`:

| Check | Result |
|---|---|
| Full `npm test` | **8,072 passed / 823 files**, exit 0, 595.21 seconds. The earlier partial-location import failures were fixed, targeted cases rerun, and this full run passed. |
| Lint and new-JavaScript gate | Passed. No new source JS/JSX files versus `origin/main`. |
| TypeScript and checked JavaScript | Both passed. |
| Strict-null and noImplicitAny ratchets | Both passed with zero enforced errors. Existing grandfathered debt remains 81 errors in one file / 180 errors in nine files respectively; ignore lists were not expanded. |
| Production build and bundle budgets | Passed. Initial assets **162.6 KB gzip** against 320 KB; total **3,241.4 KB gzip** against 3,600 KB. Build used non-secret CI placeholders and performed no deployment. |
| Edge typecheck | All **11** repository entrypoints passed on Deno 2.9.6, including both changed handlers. |
| Stripe SQL package | **22** checks passed against the actual candidate in PGlite. |
| Existing security SQL packages | Function search paths (eight helpers / 3,929 unchanged result cases), all three account-deletion scripts, **36** membership-revocation checks and the server-MFA package passed. |
| Foundation browser suite | **76** desktop/mobile cases passed. After the final recovery bootstrap change, all **18** public startup/foundation cases were rerun and passed. |
| Crane and IFC visual acceptance | Desktop/phone checks and saved screenshots described above passed; existing IFC upload/render and live flag state remain outside the synthetic destination fixture. |
| Independent source review | Crane/IFC, account identity, billing, backup and recovery changes reviewed. Reproduced recovery persistence races were fixed and rechecked before the final suite. |
| Patch hygiene | `git diff --check` and staged checks passed after removing two test-file trailing blank lines. |

Scoped test counts above overlap the full Vitest result; they must not be
added together as unique coverage. The foundation tests and PGlite packages
are separate local runs. Logs are saved in the task's `work` directory under
`security-20261008-*` and `edge-typecheck-20261008.log`; the exported validation
record maps the branch commits, migration hash and review artifacts. Hosted CI,
secret scanning, exact production drift and live provider acceptance are not
certified by these local results.

Release still requires reviewed staging acceptance, exact manual SQL application
and ledger stamping, dependent Edge artifact ordering, frontend acceptance and
effective hosting/credential checks. The existing membership/MFA/erasure
candidates remain prerequisites where applicable. No production migration,
Auth setting, billing mode, backup run, deployment or repository protection
setting was changed by this implementation work.

### Staging acceptance before closure

Use disposable identities, organizations and provider test-mode resources;
record the tested browser/Edge commit and exact SQL payload hash with results.

| Finding or change | Required acceptance |
|---|---|
| Crane graphics | Exercise the actual calculator with valid and invalid geometry on desktop and a field phone; confirm entered dimensions, utilization, camera controls and the illustration disclaimer. |
| IFC navigation | With a real test IFC and the intended effective flag, reach the existing model through sidebar, launcher and search; verify explicit project links, unauthorized-project denial and flag-off behavior. Navigation fixtures alone do not satisfy this. |
| EDGE-6 | Erase a disposable owner workspace while a teammate joins another organization; preserve both identities and the other workspace. Inject Storage failure and verify journal-based support recovery. Separately verify explicit caller-account deletion. |
| SBSEC-05/06 | Apply the reviewed candidate through the manual protocol before deploying its handler. Deliver signed test-mode events, duplicate and reorder them, and race two database connections. A failed update/receipt transaction must retry without partial entitlement; current paid, canceled, unknown-price and obsolete-subscription outcomes must match policy. Confirm hosted constraints and reconcile historical receipts separately. |
| AUTH-4 | Use real reset links on web/native, reload before/after password update, cancel, fail/retry sign-out, and open a second recovery while an older completion is pending. Test enrolled MFA and ordinary Settings rotation. Confirm project routes stay absent until recovery ends; record the dual-persistence-failure limit. |
| SBSEC-10 | Read effective environment branch restrictions and credential placement. Confirm a non-main test dispatch cannot access production credentials and that an authorized main run remains functional. Source conditions alone do not establish this result. |

Remaining severe server work starts with DB-9 credential visibility, RLS-5
project-level file isolation and SBSEC-04 mailbox binding, followed by private
atomic quotas, authoritative creation caps and event provenance. Existing
membership/MFA/erasure candidates also remain release prerequisites. Every open
row retains its owner role and closure evidence in TECH_DEBT; no result in this
batch certifies those boundaries.
