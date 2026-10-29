# SteelBuild Pro: product and commercial-readiness review

Review dates: October 28–29, 2026, America/Phoenix. Branch: `fix/critical-workflow-reliability`; review: [PR #590](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/pull/590). These repairs are proposed source changes, not a production deployment.

**Assessment: 7.5/10 as a product; 6/10 for broad commercial-launch readiness.** These are engineering judgments, not customer-survey scores. The product has substantial steel-specific workflow depth, useful domain engines, server-side workspace boundaries and a substantial test suite. The gap to a 9 is dependable execution, clear recovery, reconciled numbers, repeatable deployment and demonstrated usability. Adding more modules is a lower priority.

A supported design-partner pilot is a reasonable next milestone after the blocking checks below. Unrestricted self-service sales and claims of comprehensive offline support would be premature on the evidence available in this review.

**Evidence and limits.** Reviewed source and tests across field capture, finance, workspace vendors, entry/accessibility, native packaging and release infrastructure; independent reviewers examined reliability and security-sensitive paths. Ran local component/domain tests, build, type/lint gates, dependency audit and synthetic rollup measurements. Visually inspected the public entry page, local sign-in on phone/landscape sizes, keyboard behavior and the shared recovery fixture. This was not an authenticated browser walkthrough of every screen, a penetration test, a hosted database load test, or an observation session with actual construction users. No hosted credentials were supplied; the repository URL does not provide a logged-in staging session. No customer records, production schema or live deployment were changed.

The staging runbook contains useful historical acceptance evidence, but its older runs are not evidence that this branch passes today. Local UI used placeholder local configuration solely to render public surfaces; it did not authenticate to Supabase. The full PM/shop/field/viewer acceptance run remains outstanding.

| Dimension | Provisional score | Assessment |
| --- | --- | --- |
| Construction workflow depth | 8.5/10 | Drawing, release, piece, delivery and cost concepts form a coherent construction product. |
| Architecture and maintainability | 7.5/10 | Shared domain engines, query conventions, RLS and CI gates are strengths; large pages, mixed JS/TS and multiple presentation systems increase change risk. |
| Correctness and recovery | 7/10 | Strong rule coverage, but reproduced capture-loss and incomplete-total paths needed repairs; concurrency and recovery gaps remain. |
| UI and UX | 7/10 | Command pages fit operational work; role-specific simplicity, accessibility and consistency need broader rendered acceptance. This score is especially provisional. |
| Scalability evidence | 6.5/10 | Bundle budgets and fast pure rollups are promising. Realistic database, document, mobile-memory and concurrency measurements are missing from this review. |
| Commercial operations | 6/10 | Billing, exports, incident/release runbooks and deletion code exist. Fresh evidence of onboarding, paid lifecycle, restore and support readiness is still required. |
| Android distribution | Pre-submission | Reusable Capacitor foundation exists; Android project and release acceptance do not. See the [Google Play plan](GOOGLE_PLAY_READINESS_2026-10-28.md). |

**The 15 strongest product capabilities.** These are source-backed capabilities, not a statement that all integrations were exercised live.

| # | Capability | Customer value |
| --- | --- | --- |
| 1 | Drawing Control workbench | Coordinates sets, sheets, revisions and review context. |
| 2 | Submittal lifecycle and revision evidence | Makes approval state and outstanding response obligations traceable. |
| 3 | Fabrication-release gates | Connects release decisions to drawing and constraint evidence. |
| 4 | Canonical Piece Register | Tracks lots, splits and production state without counting parent containers as installed work. |
| 5 | Work packages and piece/drawing relationships | Organizes executable shop and field scope. |
| 6 | Scheduling and cascade engines | Connects task dates, progress and downstream impacts. |
| 7 | RFI tracking and aging | Surfaces unresolved questions affecting execution. |
| 8 | Constraint and risk management | Makes readiness blockers visible before work starts. |
| 9 | Cost Control and expense tracking | Connects budgets, spending, commitments and projected outcomes. |
| 10 | Change orders and SOV/payment applications | Maintains commercial change and billing context. |
| 11 | Field Today, daily logs, photos and punch | Captures site progress and exceptions close to the work. |
| 12 | Delivery, procurement and vendor records | Connects purchasing and logistics with project execution. |
| 13 | Project/portfolio dashboards | Gives PMs and leadership a shared operational picture. |
| 14 | Organization workspaces, permissions and audit records | Provides the basis for selling to separate companies securely. |
| 15 | Drawing/PDF and model-related tools | Keeps technical project evidence near the execution workflow. |

**Repairs implemented in this review.** Regression tests accompany the behavioral changes. Merge and release are still separate steps.

| Finding | Correction | Evidence |
| --- | --- | --- |
| Queue persistence errors could appear to succeed; corrupt/unreadable storage could be overwritten. | Write paths now fail explicitly and preserve unreadable queue data. Missing providers and stale capture callbacks reject instead of acknowledging. | `useFieldOutbox.persistence.test.tsx`, offline classification tests. |
| Field Today mutations could pause before local persistence when TanStack marked the network offline. | Field Today uses queue-first captures and `networkMode: always`. DailyLogs/Punchlist retain online-first creates with `networkMode: always` and offline fallback. Messages distinguish device storage from server sync. | `FieldToday.capture.test.tsx`, daily-log offline coverage. |
| Successful photo replay could discard bytes before the queue acknowledgement was durable. | Keep IndexedDB bytes until the updated queue is saved; delete only consumed keys. Missing bytes require a verified server receipt. | Photo persistence/replay tests and queue-commit failure tests. |
| Snapshot-based photo cleanup and failed enqueues risked loss or orphaned capture bytes. | Removed stale-snapshot garbage collection. Failed capture enqueue cleans up only its newly generated blob key; capture scope and upload allowlist are checked. | Field Today capture regressions. |
| Some failures could close a draft or change its target project. | Preserve draft state on persistence failure; retain originating project/callbacks and stable client operation IDs. | Daily-log copy/retry and field capture tests; source review. |
| Retrying an online create after a lost response could get stuck on a duplicate ID. | Online retries verify a matching receipt and compare the cleaned write shape, including blank-to-null normalization. Changed drafts remain open with an explicit recovery message. Outbox replay remains a separate limitation below. | `createWithReceipt.test.ts`, daily-log retry test. |
| Financial sources were fetched through capped list reads. | Fetch complete required sources with distinct cache keys; withhold totals/export when a required source is unavailable. | 1,250-expense regression, capped-cache regression, Cost Control recovery tests. |
| Vendor list/creation could use the wrong active workspace context. | Scope reads, keys and writes to active organization; clear stale editing/selection state on switch. Vendor performance reads now require complete sources and show load errors. | `Vendors.workspace.test.tsx`; type/lint checks. |
| Sign-in focus could escape the modal or disappear when switching modes; small/low-contrast controls hurt phone usability. | Focus containment/return, correct reset label, visible mode-change focus, 44px close control, stronger text contrast, 16px inputs and bounded scrollable modal. | Landing component tests and rendered phone/landscape checks. |
| Known dependency advisories remained. | Updated Vitest, Zod and the relevant transitive dependency resolution/override. | `npm audit`: zero findings at review time; build and type checks pass. |

**Remaining findings and market gates, in priority order.** “Unverified” means missing acceptance evidence, not a proven production defect.

| Priority | Finding/status | Required outcome before declaring ready |
| --- | --- | --- |
| P0 | Full hosted critical-path acceptance unverified | PM creates/imports scope → drawing review/IFC → authorized release → shop progress → delivery → field receipt/install → closeout and commercial reconciliation. Capture exact build, roles, test records, failures and screenshots. |
| P0 | Fresh cross-company and role acceptance unverified | A user in company A cannot read, mutate, export or fetch storage from company B using guessed IDs or direct APIs. Viewer writes fail at the database, not merely in the UI. Test revoked membership, MFA/session expiry and workspace changes. |
| P1 | Offline queue uses non-transactional localStorage read/modify/write | Serialize writes/replay across tabs, or move metadata into a transactional durable store with an owner-scoped replay lock. Prove two-tab capture and replay cannot overwrite each other. The current fixes do not establish cross-tab durability. |
| P1 | DailyLogs/Punchlist online writes still use the shared client | Bind every in-flight save to its originating authenticated owner and org, including ambiguous failure recovery. Test account switch during an unresolved save. This is a remaining race risk, not a demonstrated cross-tenant RLS bypass. |
| P1 | Progress rollback/replay can replace optimistic state | Reconcile by operation/version rather than restoring an entire schedule snapshot. Test simultaneous edits to two tasks and newer progress arriving while older progress is replayed. |
| P1 | A permanent FIFO failure blocks later queued captures | Add per-operation inspection, retry and repair/export affordances. Preserve unsynced data and explain the failed record. Establish a deliberate policy for continuing independent later operations. |
| P1 | Financial reconciliation remains incomplete | `useFinancials` totals cost-code rows; `resolveProjectSpend` also retains unmapped expenses and consumes an expense fallback once for duplicate codes. Make project-wide vs allocated totals explicit and reconcile the differences. Show the unmapped dollar amount; do not imply those costs disappeared. Test no-code projects, duplicate numbers, manual overrides, credits, voids, CO allocation and SOV across applications. |
| P1 | All outbox create handlers accept broad uniqueness errors | Punch, daily-log and photo replay must verify the exact receipt/payload, not any `23505`. A changed draft queued after an ambiguous committed insert could otherwise be acknowledged without retaining its edits. Prevent/reconcile redundant photo objects. Test missing bytes, changed content and object/row divergence. |
| P1 | Realistic large-job performance unverified | Measure staged databases and actual UI with 10k/50k lots, large drawing sets/PDFs, long histories and several simultaneous users. Profile pagination, query plans, memory, render/scroll and network payloads. Prefer server aggregates for complete totals as data grows. |
| P1 | Billing and recovery operations need current evidence | Exercise purchase/entitlement changes, webhook replay/order, seat and workspace limits, failed payment, cancellation and export. Rehearse database plus object-storage restore and exact-artifact rollback. Existing code/runbooks are not substitutes for a fresh rehearsal. |
| P1 | App-wide visual acceptance unverified | Integrate the parallel Board Report design work in PR #591 deliberately. Retest this PR's accessibility fixes when Landing changes. Test command pages in both themes, keyboard, screen reader, narrow phone and enlarged text. |
| P2 | Maintainability and documentation drift | Reduce large pages by tested slices; shrink rather than expand typecheck exceptions. Reconcile outdated migration/deployment/audit notes against current manifests and verified runtime state. |
| P2 | Connector capability must remain honest | Linked-folder actions must explain unavailable transfer capability. Verify email/SharePoint/other integrations actually deployed before marketing them as functioning sync. |
| P2 | Commercial onboarding and support need customer validation | Test workspace setup, invite, first import and first released package without coaching. Publish support route, known offline limits, export/deletion behavior and realistic service commitments. |

**The right UI/UX for this product.** The command-workbench direction is appropriate for PM and drawing-control work: dense searchable registers, explicit scope, persistent filters, revision/evidence context and clear next actions. Field work needs a smaller interaction surface with large targets, camera/progress/log actions and persistent “saved on device / syncing / synced / needs attention” states. Shop operators need a station/queue-oriented view. Viewers need readable evidence and no misleading edit affordances. A shop persona is not currently a separate database role; map its actual permissions before acceptance rather than inventing a role in the test plan.

Keep one visible project/workspace context, consistent status vocabulary and a clear reason/action for every blocked transition. Avoid displaying zero when data is unknown. Make cross-screen financial definitions visible. Preserve dual-theme tokens; do not apply dark chrome wrappers to command pages. Use progressive disclosure for detailed controls and keep the common task path short. These are proposed acceptance requirements; this review did not observe real operators completing them.

Usability study proposal: recruit at least five representative operators across PM, shop and field, plus viewer coverage. Give them task outcomes without click-by-click instructions. Record completion, errors, time and recovery. Proposed launch targets: at least 90% unassisted completion of core tasks, no unresolved critical data-loss or authorization failure, and explicit recovery for every offline failure tested. Targets must be agreed and measured; they are not current results.

**Verification recorded for this change.**

| Check | Result / qualification |
| --- | --- |
| Focused regressions | 21 files / 182 tests passed; updated wiring/recovery subset: 2 files / 20 tests passed. After the final receipt-normalization refinement, the receipt/daily-log subset passed 23 tests in two files. These overlapping runs are not additive coverage counts. |
| Full Vitest run | 944 files passed / one failed; 9,529 tests passed / two failed. Both failures are existing Mac bundle permission/symlink checks on Windows (`scripts/__tests__/macos-bundle-permissions.test.ts`: POSIX mode mismatch and Windows symlink EPERM). No unhandled errors. This full run precedes the final small receipt-normalization refinement, which passed the 23-test rerun above; it is not a green full-suite claim. No test skips or weakened assertions were added. |
| TypeScript, JS typecheck, strict-null and no-implicit-any ratchets | Passed. Ratchets still contain pre-existing exceptions: 81 strict-null diagnostics in one file, 178 implicit-any diagnostics across nine files; this change did not expand them. |
| ESLint, hook rules, no-new-JS | Passed. New source helper/tests use TypeScript. |
| Production build | Passed; large lazy-chunk warnings remain. This is a local build, not a released artifact. |
| Bundle budgets | Initial HTML assets 125.8 KB gzip; total generated assets 3,311.2 KB gzip. Both pass repository budgets of 320 / 3,600 KB. Initial HTML assets are not a complete authenticated-route download measurement. |
| Known dependency audit | Zero npm audit findings at the time checked, across production/development dependencies. Not a security certification. |
| Browser checks | Public entry, phone sign-in at 390×844, short landscape at 667×375, focus wrap/mode change, and fixture render-error → clear cause → retry → ready. |
| Pure rollup benchmark | 1k leaf lots: median 1.52 ms; 10k: 8.46 ms; 50k: 46.61 ms. One warmup plus five samples; counts/weights reconciled and containers excluded. Local Node/Windows calculation only, not an end-to-end performance claim. |

Local benchmark measurements are retained in [evidence](evidence/2026-10-28/large-job-benchmark.json). The [phone sign-in screenshot](evidence/2026-10-28/sign-in-phone.png) demonstrates the scoped visual repair, not app-wide accessibility compliance.

**Release decision.** Keep this work reviewable until applicable CI passes. Production preparation requires green `ci`, `secret-scan`, `supabase-drift`, `edge-typecheck` and `commercial-postgres`, followed by the checksummed Sites artifact, authorized promotion and exact-domain verification. Database migrations remain manually applied/stamped under the repository contract; this change adds none. Resolve the P0 acceptance gaps and data-integrity P1s before broad launch. A 9/10 claim should follow successful pilot usage and measured recovery/operability, not simply a successful build.

**Suggested sequence.** First merge reviewed repairs and verify staging; next close concurrency and reconciliation gaps; then run role/device acceptance and an observed design-partner pilot. In parallel, prepare the Android shell and Play account materials. Expand sales only when onboarding, support, billing, restore and core workflows have repeatable evidence. Calendar estimates should follow these results; Google review and organization verification are external dependencies.
