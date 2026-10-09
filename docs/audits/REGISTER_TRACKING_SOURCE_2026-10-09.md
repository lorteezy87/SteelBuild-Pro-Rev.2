# First revision tracking: preserve the recorded sheet source

This prospective client correction fixes Drawing Register **Set up tracking**
and its bulk equivalent. It does not repair historical revisions, capture an
approval, install SQL, or establish enterprise/production readiness.

## Reproduced defect and source contract

The production `drawing_register_view` derives `current_revision` from the
current `drawing_revisions` row. An untracked sheet therefore has no current
code even when `drawings.revision_number` is populated. The view does not expose
the parent PDF/page or revision number (confirmed by read-only catalog query).

At base `04285069c`, `registerProvision.ts:40–49` mapped the register projection
to an object with explicit `file_url: null`, `pdf_page: null`, and a null
revision. Both callers in `DrawingRegisterGridPanel.tsx:222–249` passed that
object to `src/lib/drawingHub/revisions.js:24–66`. The shared helper inserted a
current version-1 row with the fallback code `v1` and null source metadata.
The existing mapper test expected null source fields; that expectation was
an implementation artifact, not a business requirement.

The original mapping was introduced in `6b20369d1` on 2026-06-26. Other callers
of the shared revision helper can pass full drawing rows. This slice leaves
that shared JavaScript helper and its other callers unchanged.

Before changing production code, the new test exercised the actual mapper
and actual shared helper with only Supabase mocked. Three tests failed:

- Parent revision B / PDF / page 7 produced `v1` / null / null instead.
- Missing parent PDF still produced a current revision.
- Missing authorized parent sheet still produced a current revision.

The existing-current test passed: an incomplete historical revision was
returned unchanged. The corrected test calls the typed service now used by
both UI actions, retaining the same assertions at the network boundary.

## Narrow correction

`provisionRegisterRevision` in `registerProvision.ts` requires the register
identity to match the active project supplied by the caller. It first reads
the active current revision by **project plus drawing**, returning any existing
snapshot unchanged. It never overwrites missing historical metadata.

For a new tracked revision it reads the authorized active `drawings` row by
**project plus primary key**. Archived, deleted, superseded, inaccessible, or
mismatched parents are rejected. Recorded revision code and PDF reference must
be nonblank, and PDF page must be a positive integer. Missing fields produce a
specific completion message in the single and bulk UI; no placeholder is
inserted. Source metadata validation does not verify PDF bytes or attest that
the recorded source was historically approved.

The single-row insert copies the parent source exactly and explicitly uses
`received`, version 1, and `is_current: true`. It writes no approval, release,
round, evidence, or parent drawing state. On PostgreSQL `23505` only, the
service re-reads the same project's active current row and reuses the winner
unchanged. A missing winner or any other error remains an error. A retry after
a lost response also returns the persisted current row. There is no upsert,
update, delete, SQL migration, or view change.

## Aggregate production evidence, read only

The prior cutover census identified 84 current revisions missing PDF metadata
while their parent sheets retain PDF/page references and different revision
codes. Follow-up aggregate-only reads on 2026-10-09 found:

| Signature | Count |
|---|---:|
| Revision code `v1` and version 1 | 84 |
| No predecessor revision | 84 |
| Null file reference, PDF page, and revision source | 84 |
| Creator present | 84 |
| INSERT audit exists and already contains `v1` / null file / null page | 84 |
| INSERT audit actor present | 84 |
| Parent sheet created before revision | 84 |
| Parent last updated after revision creation | 69 |
| Revision unchanged since creation | 56 |

Creation dates are September 12 (53), 13 (1), 14 (22), 18 (3), and 21 (5).
Current distribution statuses are received (56), released for shop (21), and
released for field (7). These counts refer to distribution state, not proof of
the exact submitted or approved PDF.

This establishes creation-time missing metadata. The signature is consistent
with the live Register writer; the audit has no client callsite, so it does not
prove which UI action created each record. A catalog scan found no public
function with an `INSERT INTO drawing_revisions` statement. No customer names,
object paths, document contents, or IDs are included here, and no hosted rows
were changed. All 84 historical rows remain subject to explicit reconciliation
and review; copying current parent fields would not prove historic approval.

## Remaining revision consistency work

This client read and insert are not serialized against a simultaneous parent
sheet replacement. Fixing that race requires a separately reviewed backend
transaction contract. The unique-current constraint prevents two current rows;
it does not make the parent source read and child insert atomic.

A distinct live route also permits parent/history drift:

- `src/components/drawings/upload/useDrawingSetCreation.js:224–254` catches a
  `recordSheetSlipSheet` failure and then updates the parent revision/PDF/page.
- `src/components/drawings/RevisionUploadModal.jsx:309–336` similarly counts a
  history failure but proceeds with the parent update. Its UI reports partial
  failure; that reporting does not restore database consistency.
- `src/lib/drawingHub/revisions.js` performs current-row replacement through
  separate calls. Duplicate-code handling can return a historical revision ID
  to callers that attempt to update its source. Installed evidence guards may
  reject that update, after which those callers can still advance the parent.

A separate regression should reject the history operation, then verify the
parent source is not advanced. A complete correction needs to distinguish
pre-insert failure from a committed revision followed by a zone-carry failure,
handle retry/idempotency and parent version checks, and preserve captured
revision evidence. This slice does not adopt the quarantined transaction
candidate or modify captured rows.

## Verification boundary

- Original behavior: 3 RED regressions, 1 passing unchanged-history baseline.
- Final focused service/helper/Grid run: 65 tests passed in 3 files.
- Scoped ESLint passed. Scoped strict TypeScript uses repository `allowJs`
  settings with strict null/implicit-any diagnostics limited to changed files;
  zero diagnostics. New-JavaScript and diff-whitespace checks passed.
- Independent source review by the drawing-client agent found no scoped blocker
  in the service/Grid integration; the parent replacement race remains open.
  Exact-head CI is required before integration; no hosted browser acceptance or
  deployment is claimed by local tests or source review.
