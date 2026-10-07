# Commercial and workspace workflow continuation — October 7, 2026

This continues the full SteelBuild Pro rebuild on `codex/steel-executive-hardening`
and draft PR #499. It does not constitute whole-application or production
acceptance. The target remains structural-steel fabrication and erection
subcontractors, with all five intelligence feature groups retained in the roadmap.

## Behavior delivered in this continuation

- Projects and the RFI register use the selected workspace, preserve on-hold
  projects, and reject foreign-workspace project links. Constraint, CO, SOV and
  contract views use complete project evidence; a failed source cannot become a
  zero balance or an empty blocker list. Cross-source cache invalidation refreshes
  these combined views when their underlying records change.
- The Daily Logs list exposes its existing authorized edit/delete actions.
  PhoenixModal exposes a named dialog in the accessibility tree, supports Escape
  without stealing nested-dialog actions, traps focus and restores the opener.
- CO edits, approvals and reversals carry the timestamp, status and amount the
  user reviewed. Metadata and financial lifecycle effects commit together.
  Approval explicitly collects the approver, date and SOV treatment; rejection
  and void collect their reasons. SOV edits retain the displayed revision so a
  stale editor cannot overwrite a subsequent approved CO adjustment.
- Numbered CO, change-request, delivery, SOV and backcharge creation has one
  transaction for the number, record, carried fields, events and retry receipt.
  Drafts retain the operation identity and exact attempted payload after an
  uncertain response. The register, contract, procurement, revision-impact,
  detailing and email entry points are included in the caller audit.
  Pending and uncertain saves survive modal and route remounts in the current
  session. Attempt reservations prevent an older failure from erasing a newer
  retry; completed operations cannot be resurrected by late responses. Email
  link and attachment retries retain the confirmed created record.
- CO/RFI/SOV import repairs preserve source references, complete scope checks,
  known successes and uncertain outcomes. Data Exchange and onboarding no longer
  replay every row after a partially successful batch. Unknown generic writes
  require reconciliation; numbered writes can recover with their original
  receipt identity. Workspace changes stop subsequent writes and stale callbacks.
  SOV re-upload recognizes confirmed source lines, preserves unresolved operation
  identities, and flags changed or duplicate source references for register review.
  Onboarding retains the confirmed project and in-flight creation before retrying
  seed data. Recovery state is session memory: after a browser reload or workspace
  identity boundary, unresolved writes require reconciliation in the register.
- Delivery creates omit receipt authority fields; procurement supplies the
  required delivery title. Explicit historical CO submission dates survive the
  additive create wrapper. Existing sibling creation functions remain intact.
- The Windows dependency-audit entry point actually invokes npm, verifies a
  valid report, and preserves all existing severity and waiver rules. Nested
  dependency tests are excluded from the application test scan.

## Backend release candidate

The following migrations are **required, unapplied candidates**. The staging
catalog and ledger were read during this continuation and contained none of the
three versions or new entry points. No hosted mutation or frontend deployment
was performed. Client release requires the compatible backend first.

| Version | Purpose | SHA-256 |
| --- | --- | --- |
| `20261007112918` | Transactional numbered creation and project-scoped retry receipts | `29e8db4bd72c6f036aa8acc8437a73b4ef0defdad83787e6b809e50ba7a76eb6` |
| `20261007113400` | Reviewed CO save with atomic lifecycle effects | `8a4bee23c1d23c1308ef8b92d736a55ec43ffb0fb1a3fe0c05dffccae86ae613` |
| `20261007120658` | Reviewed SOV save protecting newer financial values | `63c398ee01f119b747b4b6fe6b20ae721f2278d6b39e110640fe3fec4c6b46b8` |

Apply only through the repository's reviewed, manually stamped process. Preserve
the required missing-migration reports; do not use `db push`, migration repair,
or a manifest exception to conceal pending application. The production database
is shared with another application, so compatibility and current authorization
must be checked against its catalog before applying.

## Verification

Local database tests use the actual candidate SQL, captured legacy functions and
guards, and synthetic records. The latest numbered-create run passed 52 cases
plus the account-erasure integration case; reviewed CO and SOV suites passed
36 and 29 cases. These fixtures use deliberately minimal RLS dependencies and
do not establish complete hosted policy or multi-session concurrency acceptance.
The separate `commercial-postgres` CI job must pass on the final commit.

The actual approval component was rendered with synthetic records and a rejected
save callback at 1440×1000 dark and 390×844 light. Both checks passed: accessible
dialog, displayed $45,500 combined amount, deduct restriction, explicit SOV
selection, retained draft after rejection, Escape/focus restoration, no horizontal
overflow, no framework overlay and no console errors. Regular Playwright was used
because the Browser plugin/skill was not available. This is presentation evidence,
not a staged approval transaction.

Targeted checks include 32 import/onboarding recovery cases, 63 SOV import/parser/
page cases, and 16 shared recovery helper/hook cases after reproducing both retry
reservation races. Final combined gates and exact-commit CI are pending at this
source checkpoint. The first browser run passed 75/76 with one navigation-context
failure while source edits continued. An earlier aggregate unit run was stopped
after reading still-red agent test snapshots. Several targeted runs also suffered
worker-startup or test timeouts during long host stalls; final serial reruns are
recorded separately. No timeout, assertion, type-ignore or bundle budget was
weakened to obtain a pass.

## Remaining acceptance

The full-app inventory and roadmap still govern the remaining module design and
business acceptance, schedule-import policy, fabrication blocker remediation,
integration, monitoring, restore and native-delivery work. Production release is
not authorized or completed by this source checkpoint. New OpenAI execution still
needs the outstanding credential choice and provider/spend controls.

The production-only dependency audit reports zero advisories, while the complete
tooling tree still reports five high entries arising from the unpatched
[Braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). A Tailwind/tooling
migration remains necessary; no waiver was added. The previously documented
staging service configuration and production migration holds also remain open.
