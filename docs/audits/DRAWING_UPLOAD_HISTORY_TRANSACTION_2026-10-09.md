# Drawing upload history: reproduced split writes and proposed transaction

Status: **uninstalled source candidate; verification in progress**, based on main
`04285069c`. Four local UI regressions still fail against the unchanged upload
source and are deliberately excluded from this SQL candidate's commits. No
product/helper change, migration promotion, hosted fixture, or production mutation
was made. The separate Register tracking correction remains frozen in PR #530.

## What fails today

`useDrawingSetCreation.js:110–132` publishes the existing set's new revision and
master PDF before processing its sheets. At `224–240` it tries to create revision
history (or replace a duplicate revision's source), catches any error, and then
at `242–258` updates the parent sheet and increments its saved count. The history
error is only logged. At `378–405`, an otherwise successful parent update can
produce a full saved count and completion callback without a process error.

`RevisionUploadModal.jsx:309–345` has the same history-catch/parent-update order.
It does count history failures and correctly withholds its final set header and
reports partial completion, but the sheet source has already advanced. Added
sheets are inserted before history creation; removed sheets are superseded before
history archival, creating similar partial-state boundaries.

The shared helper cannot supply atomicity:

1. `recordSheetSlipSheet` finds a duplicate by drawing/code and returns its ID
   without verifying it is the current revision or has the same PDF/page.
   Callers can then attempt to rewrite an archived or captured snapshot.
2. `createNewRevisionAndCarryZones` archives the old current row, inserts the new
   current row, and clones zones/links in separate network transactions. Insert
   failure attempts to restore the old current flag but ignores restoration
   failure. A later carry failure leaves the new current revision committed.
3. `carryZonesForward` inserts zones before reading/inserting their links. The
   current helper does not copy `drawing_zone_dependencies`; any future atomic
   contract must deliberately specify dependency behavior instead of silently
   losing it or guessing how external edges should be retargeted.

Changing only the inner catch to throw would stop a later parent write after an
early revision failure, but it would leave the opposite inconsistency after a
new current revision committed and zone/link copying failed. Client rollback
attempts are also subject to failure, revoked access, and competing writers.

## Local reproduction

`src/components/drawings/upload/__tests__/useDrawingSetCreation.historyFailure.test.tsx`
uses the actual hook, actual record mapping and replacement plan. Only persistence
and external side effects are mocked. Synthetic parent A points to old.pdf/page 2;
the reviewed incoming row B points to new.pdf/page 7.

Run:

```text
node node_modules/vitest/vitest.mjs run src/components/drawings/upload/__tests__/useDrawingSetCreation.historyFailure.test.tsx --maxWorkers=1
```

Observed on 2026-10-09: **4 failed / 4 tests**, for the intended reasons:

| Injected failure / required invariant | Observed result |
|---|---|
| Revision creation rejects; parent source must stay unchanged | Parent updated to B/new.pdf/page 7 |
| Failed revision operation must not count as a saved sheet | Saved count is 1 rather than 0 |
| Sole sheet fails; master set PDF/revision must not publish | Header already updated to B/new.pdf |
| Duplicate-code source rewrite rejects as captured/immutable | Parent still updated to B/new.pdf/page 7 |

These are intentionally RED development regressions, not completed acceptance.
They must not be merged as an unresolved failing suite. No host/database was
contacted by the tests.

## Existing RPC coverage

A read-only production catalog query on 2026-10-09 found no
`apply_reviewed_shop_drawing_revision` or other public function containing an
`INSERT INTO drawing_revisions`. Relevant installed functions include
`publish_drawing_revision`, revision comparison/impact functions, and
`attach_revision_to_submittal_round`.

`publish_drawing_revision` only moves an already-existing revision's current and
distribution status. It does not create the new revision, update the sheet/set
source, or clone coordination records. Its allowed statuses include `reviewed`
and release statuses, not `received`; substituting it for upload would conflate
intake with a separate review/distribution action.

The committed, **uninstalled and unwired** candidate
`supabase/migrations_quarantine/20261008032840_transactional_reviewed_shop_drawing_revision.sql`
has an all-set roster transaction and request receipt. It is useful reference
material, not a ready implementation. It currently:

- Has only an entry PM check, without explicit workspace/MFA checks or repeated
  authorization after request/set/sheet waits.
- Takes a request-row lock before the set; its ordering needs reconciliation
  with current manifest, project, Storage, and erasure contracts.
- Returns completed receipts before post-wait authorization checks.
- Rejects approved Shop Drawing sets and active zones outright, reflecting
  prerequisites that need redesign with exact revision evidence.
- Backfills existing old revision PDF/page and can synthesize `v1` history.
  This is incompatible with preserving the uncertain historical snapshots.
- Uses a public request table with service-role table access and no demonstrated
  compatible erasure/Auth lifecycle contract.
- Sets `lock_timeout` at installation rather than defining a demonstrated
  runtime bound; the 5,000-sheet input limit is not load/concurrency acceptance.

The current source-only PGlite harness does not establish hosted policy,
default-grant, concurrency, or manifest compatibility for that old candidate.
Leave the quarantined file untouched and uninstalled.

## Approved source-only contract

The invariant is one committed reviewed set revision: set header, affected
parent sheets, current revision pointers, and required coordination carry all
match the same accepted request. No approval or historic source evidence is
created as a side effect.

1. **One set transaction, explicit roster.** Introduce a new reviewed command
   from the current integration base, initially outside the migrations glob.
   Input contains project/set identity, a stable request UUID, exact expected
   set timestamp/revision, an explicit roster of unchanged/revised/added/removed
   sheets, and expected parent timestamps/current revision IDs. A missing sheet
   is not an implicit removal. Require the user's existing review of changed
   source fields; do not manufacture a missing PDF page or issue date.
2. **Bounded authorized admission.** Require current workspace access, existing
   project PM authority, and enrolled-MFA satisfaction at entry and after every
   lock wait. Recheck active org/project/set, set lock, unchanged parent routing,
   and optimistic versions after locks. Use the established set → ordered sheet
   → ordered revision order and coordinate any added parent/receipt/Storage
   locks with erasure and manifest before implementation. Reject unsupported
   isolation/timeouts with retryable errors rather than silently using stale
   snapshots. Decide measured request/coordination bounds before deployment.
3. **Private exact receipts.** Actor + request identity must serialize retries;
   canonical payload hash must cover every meaningful source/roster field. Same
   actor/key/payload returns the persisted result only after current authorization
   is rechecked; differing payload/actor fails. Explicitly revoke default table
   grants, test service-role behavior, and preserve erasure compatibility. A
   failed transaction must not leave a committed success receipt.
4. **Validate sources and duplicate codes.** Read uploaded Storage metadata for
   exact org/source association and positive pages, lock/recheck it in the agreed
   order, and keep every new revision `received`. The upload remains outside the
   DB transaction, so failed application may retain an unused uploaded file.
   Do not delete it automatically. Reuse must be request/payload idempotency;
   revision-code equality alone never authorizes replacing a historical PDF.
5. **Preserve snapshots.** Existing prior revision file/code/page remain unchanged,
   including incomplete legacy rows. Superseding a current pointer may archive
   its lifecycle state but must not backfill source attributes or alter captured
   evidence. Initially require revised/removed existing sheets to have an
   explicitly tracked current revision; PR #530 offers that path for complete
   current source metadata. Legacy missing or ambiguous tracking must be handled
   explicitly, not silently synthesized within an upload. Newly added sheets and
   their initial source revision can be created together.
6. **Carry coordination atomically.** Clone zones and links with deterministic
   old-to-new zone mapping inside the same transaction, preserving polygons and
   the established inherited-link metadata while resetting derived overrides.
   Define/test internal and cross-sheet dependency edges with the drawing owner.
   Until a topology is supported, reject the whole request with clear guidance
   rather than dropping dependencies or committing partial clones. Preserve the
   old coordination/evidence records for historical review.
7. **Publish header last, commit once.** Update parent sources, explicit removed
   sheet dispositions, and set header in the same transaction. New or changed
   sheets must not inherit approval; old rounds/manifests remain immutable and
   current coverage must become stale where appropriate. Reconcile cached set
   approval fields through the canonical governing-submittal contract, rather
   than silently detaching historical submittals. Return exact per-sheet IDs and
   counts so client completion represents a committed result.
8. **Adopt both upload paths deliberately.** Replace their split writes with one
   typed command adapter. Persist the request identity across lost-response
   retries; re-read/report committed status rather than regenerate a request or
   upload on every retry. Defer schedule work/cache invalidation until commit;
   their failure must not imply the drawing transaction failed. Audit other
   parent-source/revision writers before choosing server-side mutation guards;
   a new RPC alone does not prevent old clients or direct REST from reproducing
   the split writes. Coordinate that guard cutover and old-client handling with
   the root release owner.

An alternative per-sheet RPC could reduce transaction size, but would need an
additional durable batch/finalization contract before advancing a set header or
removing omitted sheets. It is not a complete correction by itself. Prefer the
single-set transaction if realistic workload/lock tests demonstrate safe bounds;
otherwise design the staged batch explicitly before implementation.

## Candidate and proof scope

`supabase/candidates/drawing-set-revision-transaction.sql` implements the additive
command and `get_drawing_revision_sources` reader. Neither is installed. The
reader requires current org/project PM access and enrolled-MFA satisfaction and
accepts only exact `<org>/uploads/<project>/<filename>.pdf` app-files paths. It
returns a canonical hash of existing object identity/version/update-time/eTag.
The reviewed command compares it again under a Storage row lock. This detects
metadata replacement; it does not make stored bytes immutable. Existing flat
legacy source paths are retained untouched; new uploads need an explicit project
path adapter. No uninstalled reservation table or guessed legacy binding is used.

The actor/request advisory lock is acquired before rows and followed by fresh
authorization. Every explicit row lock is NOWAIT. A function-local two-second
lock timeout bounds implicit FK/trigger waits; failed commands roll back their
entire body and return retryable `55P03`. Permission is checked again before and
after mutation/receipt writes. The READ COMMITTED requirement prevents old MVCC
snapshots from admitting stale state. Limits are 250 reviewed sheets/sources,
1 MiB payload, 1,000 set parent rows, 10,000 history rows, 1,000 affected zones,
2,000 links, 2,000 dependencies, and 1,000 hold rows. Real PostgreSQL measurements
and concurrency results must be recorded before these are claimed verified.

Only complete active same-sheet dependency topology is currently supported.
Cross-sheet edges, inactive/deleted endpoints, or active coordination that would
be discarded on removal fail the entire request. Old zones, links, dependencies,
source fields, captured evidence, rounds, and submittals remain in place. New
source revisions start received; copied zones start neutral without prior manual
status overrides. Existing activity/watch triggers run in the same transaction.

The fixture extracts committed baseline tables, FKs, source/zone/link validators,
count/activity/watch triggers and installs the exact committed revision-manifest
guards. Its membership/MFA helpers are controllable synthetic predicates for
revocation testing. It is not a replica of every hosted RLS policy, Auth trigger,
or audit trigger. Hosted rollback and authenticated acceptance remain required.

## Mandatory adoption and direct-write cutover

An atomic RPC alone does **not** repair whole-app source integrity. Promotion
requires coordinated typed upload adapters, server enforcement for protected
source/current/lifecycle writes, and old-client handling. Prefer column privileges
and explicit RPC boundaries where compatible; do not introduce a caller-set GUC
as write authority. Unrelated metadata/status rights must be assessed separately.

Read-only writer inventory against `04285069c` identified:

- `src/lib/drawingHub/revisions.js`: provision, archive/current swap, prior-source
  backfill, revision insert, duplicate-code shortcut, separate zone/link carry.
- `RevisionUploadModal.jsx` and `upload/useDrawingSetCreation.js`: set/sheet
  source writes, adds/removals, duplicate-source rewrites and history calls.
- `DrawingViewer`, `drawingViewer/useZoneData`, `RevisionCompareModal`, and
  `drawingHub/proposals`: manual bumps or implicit revision provisioning.
- Register single/bulk provisioning (prospective source fix in PR #530).
- `DrawingLogImportModal`, `TitleblockMarkerModal`, `useDrawings.ts`,
  `pages/drawings/useDrawingsPageController.ts`, and `BulkEditModal`: code/source
  import, re-extraction, generic editing or optional revision updates.
- `src/api/client/entities.ts` exposes generic Drawing, DrawingSet and
  DrawingRevision CRUD/bulk APIs; direct REST must be covered independently.
- `usePublishRevision` uses the existing publish RPC; `HoldsPanel` changes release
  status. Scale/reviewer edits and status-only helpers need separate permissions.
- No additional drawing/revision writer was found in Edge functions. The staging
  seed script creates missing synthetic sheets. `docControl/record.ts` is a pure
  planner and not an additional persistence implementation.

The adapter must take its source snapshot when review opens, retain the same
request/payload after a lost response, and invalidate caches only after a committed
receipt. It must not silently bind legacy flat uploads or attest historical
approval. The four failing UI regressions are a hard adapter acceptance gate.

## Required proof before promotion

- The four RED client tests turn green against the actual command adapter;
  both upload UIs retain reviewed-payload, retry, and partial-error behavior.
- Actual PostgreSQL failure injection at revision insert, zone/link/dependency
  copy, parent update, set update, and receipt write leaves every related row
  unchanged. Same-key retries and different-key competing set uploads are tested
  in independent sessions, including losing responses after successful commit.
- Membership/PM/MFA revocation during each wait, set archival/locking, sheet
  reassignment, Storage replacement, and erasure contention fail safely.
- Captured source attributes and round evidence remain unchanged in the database;
  the new source invalidates current coverage without rewriting prior approval.
  Lifecycle-pointer changes do not imply immutable Storage bytes.
- Typed Shop Drawing and Product Data semantics, holds, removed/added pages,
  duplicate labels, existing zones/links/dependency topology, and untracked
  legacy sheets receive explicit behavioral tests under actual policies/triggers.
- Authenticated staging rollback rehearsal plus a reviewed synthetic PDF flow,
  exact source CI, and manual deployment/hash/ledger protocol remain separate
  release gates. No production backfill or historic approval attestation.
