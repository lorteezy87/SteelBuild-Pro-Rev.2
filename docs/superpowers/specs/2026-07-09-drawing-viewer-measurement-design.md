# Drawing-Viewer Measurement — Design

**Date:** 2026-07-09
**Status:** Approved for planning
**Base:** `origin/main` @ `8c7705cc` (local checkout verified in sync)

## Problem

Two symptoms, reported by the owner:

1. A measurement is drawn, shows a number, then vanishes.
2. The number itself is wrong, even immediately after drawing.

These have two independent causes. Both are confirmed against the live database
(project `kjrwqagyeswwoxpjkcko`) and against source, not inferred.

## Root causes (confirmed)

**RC1 — the database rejects every markup insert.**
`drawing_markups_markup_type_check` permits only
`cloud, pin, dimension_note, qa_note, field_note, coordination_note`.
The viewer inserts `markup_type` verbatim from the tool name
(`useMarkup.js:151`), and the tools are
`pen, rect, cloud, highlight, arrow, measure, note, stamp`
(`AnnotationLayer.jsx:188–328`). Only `cloud` passes.

`drawing_markups` has **zero rows**. This is not measurement-specific: seven of
eight markup tools have never persisted anything. The v2 migration
(`migrations_archive/20260611140000_…`) announced the new kinds in a comment but
never widened the constraint. Broken since 2026-06-11.

Separately, note status-cycling writes `addressed | rejected | clarification`
(`AnnotationLayer.jsx:88` → `useMarkup.js:204`) against a CHECK permitting only
`open | resolved | void`. Inserts always send `status:'open'`, so this blocks
*updates* only.

The failure is near-silent: the optimistic mark is rolled back
(`useMarkup.js:167–169`) and a small `⚠ SAVE FAILED` appears in the
markup toolbar (`AnnotationToolbar.jsx:266–267`). The toolbar is collapsible.
No toast. Hence "it just vanished."

**RC2 — auto-detected scale is read off the wrong page.**
`detectScaleFromPdf(pdfDoc)` scans pages `1..N` and returns the first
architectural-scale match anywhere in the document (`detectScale.js:70–107`).
It is called with no page argument (`useAutoScaleOnLoad.js:27,55`). But sheets
live inside multi-page set PDFs and the viewer renders
`Number(activeDrawing.pdf_page)` (`DrawingViewer.jsx:355`). A sheet on page 18
inherits page 1's scale.

Both live rows with a `markup_scale` sit on `pdf_page > 1`, so both values were
produced by the whole-document scan and neither is trustworthy.

**RC3 — the label formatter has a boundary bug.**
`formatMeasureLabel` (`AnnotationLayer.jsx:938–948`) branches `if (inches < 12)`
on the **raw** value, then applies `.toFixed(1)`. Any value in `[11.95, 12)`
renders `12.0"` instead of `1'-0"`.

**Contributing:** 1,494 of 1,498 drawing rows have no scale, so their labels
render as `~8.3"` — raw paper inches. Correct per the current contract, useless
as a field measurement.

## What is NOT broken

The measurement math is sound. Geometry is captured in PDF user space via
`viewport.convertToPdfPoint` (`coords.js:35–41`), which already bakes in zoom,
pan, and rotation. Stored geometry is therefore transform-invariant, and
re-calibrating a sheet relabels its existing measurements for free. Preserve
this property.

## Decisions taken

| Question | Decision |
|---|---|
| Can viewer-tier users save markup? | **No.** RLS floors INSERT/UPDATE/DELETE at `user_has_project_role_at_least(…, 'field')`. Unchanged. Not a bug. |
| Sub-12" label form | **Bare inches** — `6 1/2"`, `0 3/16"`. Not `0'-6 1/2"`. |
| Multi-scale detail sheets | **Refuse to guess.** Badge as ambiguous; require manual Calibrate. Per-region calibration deferred. |
| Snapping | **Build it.** Spike confirmed all sampled sheets are vector. |
| Uncalibrated `~` labels | Stay decimal. Do not round page-inches to 16ths. |

### Accuracy, stated honestly

A PDF point is 1/72". At `1/8"=1'-0"` (`markup_scale` 96), one point is **1.33
real inches** — 21× coarser than 1/16". Rounding the display to 16ths without
snapping would print false precision. Snapping to vector geometry is what makes
1/16" meaningful, and it only works on vector sheets.

### Spike results (2026-07-09)

Four real sheets, authenticated as `mcp-agent`, `getOperatorList` + CTM replay:

| Sheet | Page | Size | `constructPath` ops | Unique anchors | `getOperatorList` | Walk |
|---|---|---|---|---|---|---|
| J1.4 | 7/19 | 5.9 MB | 10,518 | 33,085 | 263 ms | 13 ms |
| S223 | 11/13 | 5.4 MB | 6,811 | 20,576 | 123 ms | 14 ms |
| S6 | 8/8 | 4.3 MB | 8,132 | 11,269 | 56 ms | 6 ms |
| SE502 | 18/19 | 9.9 MB | 10,250 | 15,370 | 81 ms | 7 ms |

All vector. All have a live text layer (1,042–7,952 chars), so per-page scale
detection has something to read. `S223` contains one form-XObject, confirming
`paintFormXObject` CTM handling is required for correctness.

---

## Ship 1 — Correctness

### 1.1 Migration

Widen both CHECKs; add scale provenance. The table has zero rows, so widening
is risk-free. Legacy values are retained (no reader depends on them, but
keeping them costs nothing).

```sql
ALTER TABLE public.drawing_markups DROP CONSTRAINT IF EXISTS drawing_markups_markup_type_check;
ALTER TABLE public.drawing_markups ADD  CONSTRAINT drawing_markups_markup_type_check
  CHECK (markup_type IN (
    'cloud','pin','dimension_note','qa_note','field_note','coordination_note',
    'pen','rect','highlight','arrow','measure','note','stamp'
  ));

ALTER TABLE public.drawing_markups DROP CONSTRAINT IF EXISTS drawing_markups_status_check;
ALTER TABLE public.drawing_markups ADD  CONSTRAINT drawing_markups_status_check
  CHECK (status IN ('open','addressed','rejected','clarification','resolved','void'));

ALTER TABLE public.drawings ADD COLUMN IF NOT EXISTS scale_status text;
ALTER TABLE public.drawings ADD CONSTRAINT drawings_scale_status_check
  CHECK (scale_status IS NULL OR scale_status IN ('undetected','ambiguous','auto','manual'));
```

`calibrate` is a tool, not a markup type — it calls `onCalibrate`, never
`onAddItem` (`AnnotationLayer.jsx:183–186`). **Do not add it to the CHECK.**

Backfill — reset the two live rows only; leave soft-deleted rows alone. The
soft-delete predicate is `is_deleted = false` (boolean, `NOT NULL DEFAULT
false`). Verified 2026-07-09: this statement matches exactly `J1.4` (page 7)
and `S223` (page 11), and nothing else.

```sql
UPDATE public.drawings
   SET markup_scale = NULL, scale_status = 'undetected'
 WHERE markup_scale IS NOT NULL
   AND is_deleted = false
   AND COALESCE(pdf_page, 1) > 1;
```

⚠ CI does not run migrations. Apply in-DB and name the committed file to match
the recorded `schema_migrations` version.

### 1.2 `formatFeetInches`

New `src/utils/feetInches.js`. Signature:

```
formatFeetInches(decimalInches, { precision = 16, prefix = '', emptyLabel = '—' })
```

Algorithm — **round to ticks first**, which makes the foot-carry fall out for
free:

1. Non-finite → `emptyLabel`, bare (no prefix, no sign).
2. `sign = decimalInches < 0 ? '-' : ''`; `a = Math.abs(decimalInches)`.
3. `totalTicks = round(a * precision)`; `whole = floor(totalTicks / precision)`;
   `remTicks = totalTicks − whole * precision`.
4. `reduceFraction(remTicks, precision)` — reuse the existing export in
   `src/utils/fractionConversion.js:41`. It returns `null` when there is no
   fraction; null-check.
5. `whole < 12` → `"{whole}[ n/d]\""` (always show the integer, including `0`).
   `whole ≥ 12` → `"{feet}'-{inch}[ n/d]\""`.
6. Return `prefix + sign + body`.

The repo already has three length conventions (`formatLength` ticks/always-feet;
`decimalFeetToFtIn` feet-input/always-feet; `decimalInchesToFraction`
inches-only/no-feet). None fits. Do not merge them; do not add a fourth by
accident — this one is for measured lengths in decimal inches.

Uncalibrated `~` labels keep `formatMeasureLabel`, but fix RC3: round to one
decimal **first**, then branch. Do not round page-inches to 16ths.

**Required tests** (Vitest, co-located `__tests__`):

- `0 → 0"`; `0.01 → 0"`; `0.0625 → 0 1/16"`; `0.1875 → 0 3/16"`; `0.5 → 0 1/2"`
- `5 → 5"`; `6.25 → 6 1/4"`; `6.5 → 6 1/2"`; `2.75 → 2 3/4"`
- carry into feet: `11.9 → 11 7/8"`; `11.96875 → 1'-0"`; `11.97 → 1'-0"`
- boundaries: `12 → 1'-0"`; `12.5 → 1'-0 1/2"`; `23.96875 → 2'-0"`; `174 → 14'-6"`
- `NaN`, `Infinity` → `—` (no prefix)
- negative `-6.5` → `-6 1/2"`
- fraction reduction: `8/16 → 1/2`, never emit `inch ≥ 12`

### 1.3 Per-page scale detection

`detectScaleForPage(pdfDoc, pageNumber)`. Callers pass
`Math.min(activeDrawing.pdf_page, pdfDoc.numPages)` — **not** the visible
`currentPage`, **not** page 1. Keep a whole-document fallback when `pdf_page` is
null or 0 (single-master PDFs, legacy rows).

Return a status, never a bare number:

- `single` + confidence `high|low` — exactly one distinct arch scale
- `ambiguous`, reason `multiple` (≥2 distinct arch scales) | `as_noted` | `nts`
- `none`, reason `no_text` | `no_match`
- `metric` (`1:N`) — low confidence, **confirm-then-apply**

Two corrections to prior belief, both verified:

- `ARCH_SCALES` is ordered **smallest**-inches-per-pdf-inch first. "First match
  wins" therefore selects the *largest drawing scale* present — a `1/2"` detail
  beats a `1/4"` plan. Position in the text is irrelevant.
- The `1:N` metric ratio is **unit-independent** and dimensionally correct for
  mm and inch drawings alike. The code comment claiming otherwise
  (`detectScale.js:111–115`) is wrong. Low confidence is about false positives
  (key maps, revision ratios), not units.

Add an anchored marker regex and stop swallowing the hit:

```js
/\bscale\b[^a-z0-9]{0,8}(?:as\s+noted|as\s+shown|varies|n\.?t\.?s\.?|not\s+to\s+scale)\b/i
```

An `NTS`/`AS NOTED` hit on the target page must **return** `ambiguous`, not
`continue` past it (`detectScale.js:91–94`).

**Auto-apply gate:** only `status === 'single' && confidence === 'high'`. Never
for `ambiguous` or `metric`. Persist `scale_status` on Undo/decline so the
on-load effect stops re-arming — today Undo writes NULL and the detection
silently reappears next session (`useAutoScaleOnLoad.js:45–50, 67`).

**Badge** (`ViewerToolbar.jsx:139–156`, canvas mode only) is driven by
`(markup_scale, scale_status)`, with four states: calibrated (fraction);
`Ambiguous ⚠` (tooltip lists candidates; AUTO opens a picker rather than
applying); `No Scale`; metric-unconfirmed.

`detectScale.js` currently has **zero** tests. Add coverage for the
`ARCH_SCALES` table, the ambiguity rules, and the per-page selection.

---

## Ship 2 — Snapping

Scope: **measure and calibrate only**, gated on `activeTool`. The coordinate
choke points (`AnnotationLayer.jsx:155` pointerDown, `:241` pointerMove) are
tool-agnostic and also feed `onAddItem`/`onCalibrate`; placement alone does not
scope snapping.

**Targets:** segment endpoints (`moveTo`/`lineTo`), rectangle corners, and curve
**end** points. Skip bezier control points — they are phantom targets not on the
drawn curve. Midpoints and perpendicular are O(n) and cheap; extracting
endpoints already reconstructs the edge list. Defer only true segment-segment
intersections (O(n²) / sweep-line).

**Extraction** (`pdfjs-dist` 4.10.38, verified against `node_modules`):

- `page.getOperatorList()`. Geometry arrives as **thousands of small**
  `OPS.constructPath` ops — one per maximal run of consecutive path ops — not
  one page-wide batch. Each entry is `[ops, coords, minMax]`.
- Decode with a running index: `moveTo`/`lineTo` consume 2; `rectangle` 4 (→ 4
  corners); `curveTo` 6 (end = `coords[j+4], coords[j+5]`); `curveTo2`/`curveTo3`
  4; `closePath` 0.
- Coordinates are **pre-CTM**. Replay `save`/`restore`/`transform`, **and**
  `paintFormXObjectBegin`/`End` — form-XObject matrices are not `OPS.transform`,
  and detail bubbles on steel sheets live inside them. Anchor =
  `Util.applyTransform([x, y], ctm)`.
- Do **not** apply the viewport transform. The result already lands in the same
  space as stored `geom` (`convertToPdfPoint`): no y-flip, no scaling.

**Performance:** one O(total-segments) walk per page → dedupe → cache in PDF
space, so zoom and rotation never invalidate it. Index anchors with a uniform
grid, not a quadtree. Budget for ~10k ops and ~33k unique anchors per sheet;
measured 56–263 ms parse, 6–14 ms walk.

**Raster fallback:** no hard flag. Few or zero anchors means snapping simply
finds nothing. Do not reuse `pdfSheetExtractor.js:204` (`scanned: totalChars < 50`)
— that is a whole-*document* aggregate, wrong granularity. Hybrid sheets (raster
body, vector title block) emit `constructPath` ops and would be misclassified.

A working reference implementation of the extraction + CTM replay exists from
the spike; it ran clean against all four sheets.

---

## Ship 3 — Section-cut hyperlinks (separate spec)

PlanGrid-style navigation from a section cut to its detail. New table, new
link-authoring UI, new navigation model. Explicitly out of scope here; it
shares no code with the above beyond the viewer shell.

---

## Non-goals

- Per-region / per-viewport calibration (the correct end state for `AS NOTED`
  detail sheets; deferred deliberately).
- Metric display. A `measurement_units` preference exists in `DisplayTab.jsx`
  but is marked `<NotYetActive/>`; the formatter takes a `precision` option and
  no unit system.
- OCR for scanned title blocks.
- Changing the RLS role floor.
- Segment-segment intersection snapping.

## Risks

- **Migration is applied out-of-band.** CI runs no migrations. Verify in-DB
  before calling this done — this has bitten the project before.
- **`userUnit != 1` sheets.** The viewport bakes `userUnit` in; CTM-replay
  anchors exclude the viewport transform. Verify alignment on a large-format
  sheet before trusting snap targets there.
- **`getOperatorList` may force a second worker parse.** Measured 263 ms worst
  case in Node on a 5.9 MB sheet; confirm in-browser on the largest real sheet.
- **Two claims went unverified** (their verifier agents crashed on the schema
  retry cap): the exact migration filename convention, and the complete
  enumeration of length-render call sites. Re-check both by hand.
- `coords.js:8` comments claim top-left PDF space; `convertToPdfPoint` returns
  y-up bottom-left. The round-trip is self-consistent — confirm no consumer
  relies on the top-left reading before doing y-math.

## Open questions

- Should scale detection run in iframe render mode? Today the whole scale group
  is canvas-only (`ViewerToolbar.jsx:139`).
- Escalate persistent save failures to a toast, rather than the collapsible
  `⚠ SAVE FAILED`?
- Final `scale_status` enum — is `auto` vs `manual` provenance worth carrying,
  or is `ambiguous` vs `undetected` sufficient?
