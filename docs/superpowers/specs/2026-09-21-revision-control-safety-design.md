# Revision-Control Safety Design

## Purpose

Make a newly revised structural drawing fail closed at the existing fabrication-release boundary whenever the system cannot establish the revision's comparison, downstream exposure, or scoped model mapping. The change must improve the operator's next action without creating a second drawing, submittal, or release workflow.

## Scope

This first slice changes only the revision-control path for an active sheet that supersedes an earlier revision and is in the work package being released. It covers revision-impact status, comparison recovery and review evidence, model-mapping evidence, and the Document Control handoff.

It does not change the submittal-derived stage model, existing RFI/hold/superseded-sheet release blockers, historical release records, or the sheet/register source of truth. It does not auto-create hyperlinks; that is a separate reviewed-proposal slice.

## Existing authority

- `submittals` remain the source of truth for workflow stage.
- `evaluate_fab_release_set` and `evaluate_release_gate` remain the only release authority. The browser may display their decision but must not invent a competing release predicate.
- `drawing_revisions` identify the current and superseded snapshot pair. `drawing_revision_comparisons` already stores a unique revision-pair comparison with `pending`, `processing`, `complete`, or `error` status.
- `model_elements` and the existing piece/drawing-set links provide the model scope. An unloaded roster, an absent link, and an empty proven scope are different states and must remain distinct.
- Document Control remains read-only; uploading a file there never creates, replaces, or releases a drawing.

## Revision-control contract

The shared typed derivation returns one status per changed, in-scope sheet:

| Status | Meaning | Release result |
|---|---|---|
| `clear` | Required evidence is present and shows no unresolved review condition. | Existing release gate continues. |
| `review_required` | Evidence is missing, incomplete, ambiguous, or needs a responsible human decision. | Block release until an authorized, audited override. |
| `blocked` | Existing hard blocker applies, such as an open fab hold/RFI, a superseded or rejected sheet, or an active hold. | Block release; existing remediation applies. |

The status is additive to existing release reasons. No prior response key, status label, or gate result is removed. `review_required` is not rendered as `No`, `Not downstream`, or `0 affected pieces`.

Evidence is evaluated only for an active revision that has a real predecessor. An initial issue does not need a comparison. A release already recorded remains historical evidence and is never revoked by this change.

### Evidence rules

1. **Comparison**: a predecessor/current pair with a completed persisted comparison is `clear`. A completed visual-review record and a completed AI-assisted record are both valid; AI is never mandatory. A missing pair, missing revision file/page, pending/processing/error comparison, or failed client render is `review_required`. A failed render is recoverable evidence failure, not a silent no-change result.
2. **Downstream exposure**: a positively recorded fabrication, delivery, or installation date is surfaced as exposure and requires review. Missing downstream dates are `review_required`; they are never evidence that the sheet is upstream.
3. **Model mapping**: only an exact drawing-set link or an explicitly labelled sequence fallback may support a piece count. A roster not loaded, absent, or unable to resolve the changed set is `review_required`. A global model count may never be used as proof that this sheet has no affected pieces.
4. **Existing hard blockers**: the present server-side RFI, hold, approval, revision, scope, and file checks remain `blocked` and retain their existing messages.

## Server and client flow

1. A revision upload creates the normal current/superseded revision pair.
2. The operator opens Compare. Rasterization has a bounded retry and clear retry/fallback controls. A successful visual review records the existing comparison pair as complete; AI Diff stays disabled until both rasters exist and is advisory, never a release requirement.
3. The operator records or completes the comparison through the existing comparison record, then reviews the scoped model result.
4. Fab Release calls the existing server gate. The gate appends a `revision_control` check containing the status, stable reason codes, and affected sheet/set identifiers. `review_required` rejects the release exactly as a hard blocker does, unless the existing authorized override path supplies an audited reason.
5. The client renders the server's returned reasons verbatim through shared status metadata. Control Board, Revision Impact, and Fab Release therefore show the same decision.

The database change is owner-controlled: this repository's shared production ledger requires the migration source, ledger stamp, and production verification to move together. This branch will not execute SQL against production, run `supabase db push`, or deploy. The implementation plan must include the owner handoff and verification queries as a separate deployment step.

## User experience

### Revision Impact and model mapping

- Replace a binary `Fab Blocked?` chip with `Clear`, `Review required`, or `Blocked`, including a concise reason tooltip.
- Show scoped piece evidence as `Exact`, `Sequence estimate`, or `Unknown`; never use an em dash or zero as an all-clear.
- Present total IFC elements, eligible steel members, scoped linked members, unresolved scoped members, and the source/freshness timestamp as separately labelled facts.

### Document Control

After read-only preflight, show one next action per sheet: `Matched — start revision upload`, `Ambiguous — resolve sheet match`, `New sheet — use Upload Set`, or `Extraction incomplete — review source PDF`. The call to action may navigate to the existing flow but does not pass a file, mutate a record, or silently choose an ambiguous match.

## Verification

- Pure tests cover each evidence state and prove unknown never becomes clear.
- Component tests cover compare render error/retry, AI-disable state, correct revision-impact labels, model-count provenance, and Document Control next actions.
- Server-gate tests prove a changed in-scope sheet with missing evidence rejects a release, a clear sheet preserves the existing result, and an authorized override is recorded. Existing fab-release E2E remains green.
- Production verification is a separately authorized owner action against the staged migration, with the gate's returned JSON and an attempted rejected release captured as evidence.

## Slice two: reviewed hyperlink proposals

The second slice will build on existing `callouts`, `sectionCutLinks`, and `drawing_zone_proposals`. It will generate deduplicated proposals only when a target sheet/detail is uniquely resolvable, retain unresolved callouts for review, and apply accepted links relative to the drawing set. It will not auto-link ambiguous references.
