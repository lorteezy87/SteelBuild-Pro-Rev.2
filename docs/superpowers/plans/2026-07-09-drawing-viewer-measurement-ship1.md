# Drawing-Viewer Measurement — Ship 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make drawing markup persist at all, and make measurement labels read as correct feet-inches to the nearest 1/16".

**Architecture:** Three independent defects, fixed in dependency order. (1) A database CHECK constraint rejects 7 of 8 markup kinds, so `drawing_markups` has never held a row — widen it. (2) Scale auto-detection scans page 1 of the set PDF regardless of which sheet is open — make it per-page and teach it to refuse to guess on multi-scale detail sheets. (3) The label formatter branches on an unrounded value — extract it to a pure, testable module and build it on the repo's existing `reduceFraction`.

**Tech Stack:** Vite + React 18, Supabase (project `kjrwqagyeswwoxpjkcko`), pdfjs-dist 4.10.38, Vitest (node environment, co-located `__tests__`).

**Spec:** `docs/superpowers/specs/2026-07-09-drawing-viewer-measurement-design.md`

**Not in this plan:** Vertex snapping (Ship 2, separate plan). Section-cut hyperlinks (Ship 3, separate spec).

---

## Background the engineer needs

**`markup_scale` means `real_inches_per_pdf_inch`.** A PDF point is 1/72". So
`realInches = (pdfDistanceInPoints / 72) * markup_scale`. At `1/8"=1'-0"`,
`markup_scale` is 96.

**Geometry is stored in PDF user space** via `viewport.convertToPdfPoint`, which
already accounts for zoom, pan, and rotation. Never store screen coordinates.
Because of this, re-calibrating a sheet relabels its existing measurements for
free — preserve that property.

**Sheets live inside multi-page set PDFs.** A `drawings` row has `pdf_page`
pointing at its page within the set. `DrawingViewer.jsx:355` renders that page.
Anything that reads the PDF for a sheet must use `pdf_page`, not page 1 and not
the visible `currentPage`.

**`calibrate` is a tool, not a markup type.** It calls `onCalibrate`, never
`onAddItem`. It is never persisted to `drawing_markups`. Do not add it to any
CHECK constraint.

**CI does not run migrations.** A green build and a successful Vercel deploy do
*not* mean your migration reached the database. Always verify in-DB.

**Windows:** Vitest is pinned to `maxWorkers: 2` in `vite.config.js`. Just run
`npm test`.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/<version>_drawing_markup_types_and_scale_status.sql` | Create | Widen both CHECKs; add `drawings.scale_status`; reset 2 bad scales |
| `src/utils/feetInches.js` | Create | `formatFeetInches` — the one canonical measured-length formatter |
| `src/utils/__tests__/feetInches.test.js` | Create | Its tests |
| `src/components/drawings/viewer/measureLabel.js` | Create | `formatMeasureLabel` — pure, extracted from the component so it is node-testable |
| `src/components/drawings/viewer/__tests__/measureLabel.test.js` | Create | Its tests |
| `src/components/drawings/viewer/AnnotationLayer.jsx` | Modify | Delete local `formatMeasureLabel` (938–948), import the module instead |
| `src/components/drawings/viewer/detectScale.js` | Modify | Add per-page detection + ambiguous status; keep whole-doc fallback |
| `src/components/drawings/viewer/__tests__/detectScale.test.js` | Create | Its tests — this module currently has **zero** |
| `src/pages/drawingViewer/useAutoScaleOnLoad.js` | Modify | Call per-page; gate auto-apply; persist `scale_status` |
| `src/pages/drawingViewer/ViewerToolbar.jsx` | Modify | Badge gains `Ambiguous` state |
| `src/pages/DrawingViewer.jsx` | Modify | Pass `scaleStatus`; stamp `scale_status:'manual'` on calibrate |
| `src/types/supabase.ts` | Modify | Regenerate for `scale_status` |
| `AGENT_CLAIMS.md` | Modify | Claim then release |

---

## Task 0: Claim the files

Other agent sessions write to `main` concurrently. Row 36 (`dark-theme-full-app`,
dated 2026-06-28) globs `src/components/drawings/**/*` and is stale by the
board's own 2-day rule, but claim explicitly rather than assume.

**Files:**
- Modify: `AGENT_CLAIMS.md`

- [ ] **Step 1: Sync and inspect the board**

```bash
cd /c/dev/SteelBuild-Pro-Rev.2
git pull origin main
```

Read the **Active claims** table. Confirm no *fresh* (< 2 days old) claim
overlaps `src/components/drawings/viewer/**`, `src/pages/drawingViewer/**`,
`src/pages/DrawingViewer.jsx`, `src/utils/**`, or `supabase/migrations/**`.

- [ ] **Step 2: Add one row to the Active claims table**

Append to the table in `AGENT_CLAIMS.md` (use today's UTC date):

```markdown
| 2026-07-09T00:00:00Z | measurement-ship1 | Drawing-viewer measurement correctness | src/components/drawings/viewer/{AnnotationLayer.jsx,detectScale.js,measureLabel.js} · src/pages/drawingViewer/{useAutoScaleOnLoad.js,ViewerToolbar.jsx} · src/pages/DrawingViewer.jsx · src/utils/feetInches.js · supabase/migrations/** | Fix drawing_markups CHECK (7 of 8 markup kinds rejected), per-page scale detection + ambiguous state, canonical ft-in 1/16" formatter. Spec: docs/superpowers/specs/2026-07-09-drawing-viewer-measurement-design.md |
```

- [ ] **Step 3: Commit and push just this file**

```bash
git add AGENT_CLAIMS.md
git commit -m "chore(claims): claim drawing-viewer measurement correctness"
git push origin "$(git rev-parse HEAD):main"
```

Never `git push origin HEAD:main` — push a verified SHA. If the push is
rejected, `git pull --rebase origin main` and retry. A conflict *on this file*
is expected and good: keep both rows.

---

## Task 1: Migration — unblock persistence ✅ DONE (2026-07-10)

This is the fix for the reported "measurement vanishes" symptom. It is not
measurement-specific: `pen`, `rect`, `highlight`, `arrow`, `measure`, `note`,
and `stamp` are all rejected today. Only `cloud` passes.

> **Applied as `20260710070047_drawing_markup_types_and_scale_status`, commit
> `c7ea5f8d`. The backfill in Step 3 was DROPPED — do not run it.**
>
> Two reasons, found on execution:
>
> 1. **It would destroy correct data.** Probing each sheet's own page text layer
>    shows `J1.4` (page 7) and `S223` (page 11) both print `SCALE: 1/8" = 1'-0"`
>    → 96, exactly what is stored. Page 1 of each set PDF has no scale at all,
>    so the old forward scan landed on an agreeing page. The values are right;
>    only the mechanism was wrong.
> 2. **The database would have refused it.** Both sheets sit on drawing sets
>    auto-locked by the fab-release gate. `guard_drawing_set_lock_for_drawings`
>    rejects any `UPDATE` to a locked set's `drawings` row — no column filter,
>    no bypass in `raise_if_drawing_set_locked`. The combined migration aborted
>    with `42501 DRAWING_SET_LOCKED` and rolled back atomically; the DDL was
>    then applied alone.
>
> Consequence for later tasks: those two rows keep `markup_scale = 96` and
> `scale_status = NULL`. That is the correct end state. `useAutoScaleOnLoad`
> skips any drawing with a `markup_scale`, and the badge renders the fraction
> from `markup_scale` alone, so neither needs `scale_status` set.

**Files:**
- Create: `supabase/migrations/<recorded-version>_drawing_markup_types_and_scale_status.sql`

- [ ] **Step 1: Confirm the current constraints and row count**

Use the Supabase MCP `execute_sql` tool, `project_id: kjrwqagyeswwoxpjkcko`:

```sql
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.drawing_markups'::regclass and contype = 'c';

select count(*) as rows from public.drawing_markups;
```

Expected: `markup_type` CHECK lists only `cloud, pin, dimension_note, qa_note,
field_note, coordination_note`; `status` CHECK lists only `open, resolved,
void`; `rows = 0`.

If `rows > 0`, **stop** — someone widened the constraint already, and the
backfill assumptions in this plan need rechecking.

- [ ] **Step 2: Confirm exactly which rows the backfill will touch**

```sql
select sheet_number, pdf_page, markup_scale
from public.drawings
where markup_scale is not null and is_deleted = false and coalesce(pdf_page,1) > 1
order by sheet_number;
```

Expected: exactly two rows — `J1.4` (page 7, 96) and `S223` (page 11, 96).
If you see other rows, stop and report; someone has calibrated a sheet since
2026-07-09 and you would be destroying their work.

- [ ] **Step 3: Apply the migration via MCP `apply_migration`**

Name: `drawing_markup_types_and_scale_status`

```sql
-- Widen markup_type to the 8 kinds the viewer actually emits.
-- Legacy values retained: no reader depends on them, but the table is empty
-- so keeping them costs nothing. 'calibrate' is a TOOL, not a markup_type —
-- it calls onCalibrate, never onAddItem. Do not add it.
ALTER TABLE public.drawing_markups DROP CONSTRAINT IF EXISTS drawing_markups_markup_type_check;
ALTER TABLE public.drawing_markups ADD  CONSTRAINT drawing_markups_markup_type_check
  CHECK (markup_type IN (
    'cloud','pin','dimension_note','qa_note','field_note','coordination_note',
    'pen','rect','highlight','arrow','measure','note','stamp'
  ));

-- Note status-cycling writes addressed|rejected|clarification (AnnotationLayer
-- MARKUP_STATUS_ORDER). Inserts always send 'open', so this blocks UPDATE only.
ALTER TABLE public.drawing_markups DROP CONSTRAINT IF EXISTS drawing_markups_status_check;
ALTER TABLE public.drawing_markups ADD  CONSTRAINT drawing_markups_status_check
  CHECK (status IN ('open','addressed','rejected','clarification','resolved','void'));

-- markup_scale IS NULL currently means four different things: never attempted,
-- nothing detected, ambiguous sheet, or user pressed Undo. Disambiguate, so the
-- on-load auto-detect stops re-arming on sheets the user already declined.
ALTER TABLE public.drawings ADD COLUMN IF NOT EXISTS scale_status text;
ALTER TABLE public.drawings DROP CONSTRAINT IF EXISTS drawings_scale_status_check;
ALTER TABLE public.drawings ADD CONSTRAINT drawings_scale_status_check
  CHECK (scale_status IS NULL OR scale_status IN ('undetected','ambiguous','auto','manual'));

-- NO BACKFILL. See the note at the top of this task: the two candidate rows
-- already hold the scale printed on their own sheet, and both sit on
-- fab-release-locked drawing sets whose guard trigger rejects any UPDATE.
```

- [ ] **Step 4: Verify in-DB — the migration is live**

```sql
select pg_get_constraintdef(oid) as def
from pg_constraint
where conname = 'drawing_markups_markup_type_check';

select count(*) as still_scaled
from public.drawings
where markup_scale is not null and is_deleted = false;
```

Expected: the CHECK now contains `measure` and `stamp`; `still_scaled = 0`.

- [ ] **Step 5: Prove an insert now succeeds, then clean up**

```sql
insert into public.drawing_markups (project_id, drawing_id, markup_type, page_number, status, payload)
select project_id, id, 'measure', 1, 'open', '{}'::jsonb
from public.drawings where is_deleted = false limit 1
returning id, markup_type;

delete from public.drawing_markups where markup_type = 'measure' and payload = '{}'::jsonb;
```

Expected: the insert returns a row (previously it raised
`violates check constraint "drawing_markups_markup_type_check"`), and the
delete removes it. Confirm `select count(*) from public.drawing_markups` is `0`
again.

- [ ] **Step 6: Commit the migration file with the recorded version**

The filename must equal the version Supabase recorded, or the next `db push`
will replay it. Read the recorded version:

```sql
select version from supabase_migrations.schema_migrations order by version desc limit 3;
```

Save the SQL from Step 3 to
`supabase/migrations/<that-version>_drawing_markup_types_and_scale_status.sql`.

```bash
git add supabase/migrations/
git commit -m "fix(drawings): widen drawing_markups CHECKs; add drawings.scale_status

7 of 8 viewer markup tools (pen, rect, highlight, arrow, measure, note, stamp)
emitted markup_type values the CHECK rejected, so drawing_markups has held zero
rows since the v2 markup migration. Widen markup_type and status, add
scale_status to disambiguate a NULL markup_scale, and reset the two live scales
that the whole-document scan read off the wrong page."
```

---

## Task 2: `formatFeetInches` (TDD)

The repo has three length formatters and none fits: `formatLength` (ticks in,
always feet), `decimalFeetToFtIn` (decimal *feet* in, always feet), and
`decimalInchesToFraction` (inches in, never feet). We need decimal *inches* in,
bare inches under 12", feet-inches at and above. Build on the existing exported
`reduceFraction` (`src/utils/fractionConversion.js:41`). Do not write another
`gcd` — there are two private copies already.

**Files:**
- Create: `src/utils/feetInches.js`
- Test: `src/utils/__tests__/feetInches.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/feetInches.test.js`:

```js
/**
 * Unit tests for feetInches.js — the canonical measured-length formatter.
 *
 * The load-bearing case is the carry: rounding to 1/16ths must happen BEFORE
 * we decide whether the value is "under 12 inches", or 11.97" prints as 12"
 * instead of 1'-0".
 */

import { describe, it, expect } from "vitest";
import { formatFeetInches } from "../feetInches";

describe("formatFeetInches — bare inches under 12", () => {
  it("formats zero", () => {
    expect(formatFeetInches(0)).toBe('0"');
  });
  it("rounds sub-16th values away", () => {
    expect(formatFeetInches(0.01)).toBe('0"');
  });
  it("keeps a leading zero on sub-inch fractions", () => {
    expect(formatFeetInches(0.0625)).toBe('0 1/16"');
    expect(formatFeetInches(0.1875)).toBe('0 3/16"');
  });
  it("reduces 8/16 to 1/2", () => {
    expect(formatFeetInches(0.5)).toBe('0 1/2"');
  });
  it("formats whole inches without a fraction", () => {
    expect(formatFeetInches(5)).toBe('5"');
  });
  it("formats common shop fractions", () => {
    expect(formatFeetInches(6.5)).toBe('6 1/2"');
    expect(formatFeetInches(6.25)).toBe('6 1/4"');
    expect(formatFeetInches(2.75)).toBe('2 3/4"');
  });
});

describe("formatFeetInches — feet-inches at 12 and above", () => {
  it("formats the exact 12-inch boundary", () => {
    expect(formatFeetInches(12)).toBe(`1'-0"`);
  });
  it("formats feet with a fraction", () => {
    expect(formatFeetInches(12.5)).toBe(`1'-0 1/2"`);
  });
  it("formats a typical span", () => {
    expect(formatFeetInches(174)).toBe(`14'-6"`);
  });
});

describe("formatFeetInches — the carry bug", () => {
  it("does not carry below the rounding threshold", () => {
    expect(formatFeetInches(11.9)).toBe('11 7/8"');
  });
  it("carries into feet when rounding reaches 12 inches", () => {
    expect(formatFeetInches(11.96875)).toBe(`1'-0"`);
    expect(formatFeetInches(11.97)).toBe(`1'-0"`);
  });
  it("carries at a higher foot boundary", () => {
    expect(formatFeetInches(23.96875)).toBe(`2'-0"`);
  });
  it("never emits an inch component of 12 or more", () => {
    for (let ticks = 0; ticks <= 16 * 60; ticks++) {
      const out = formatFeetInches(ticks / 16);
      const m = out.match(/'-(\d+)/);
      if (m) expect(Number(m[1])).toBeLessThan(12);
    }
  });
});

describe("formatFeetInches — contracts", () => {
  it("returns the empty label for non-finite input, with no prefix", () => {
    expect(formatFeetInches(NaN, { prefix: "~" })).toBe("—");
    expect(formatFeetInches(Infinity)).toBe("—");
  });
  it("places the prefix outside the value", () => {
    expect(formatFeetInches(6.5, { prefix: "~" })).toBe('~6 1/2"');
  });
  it("signs negatives inside the prefix", () => {
    expect(formatFeetInches(-6.5)).toBe('-6 1/2"');
  });
  it("honours a coarser precision", () => {
    expect(formatFeetInches(6.5, { precision: 4 })).toBe('6 1/2"');
    expect(formatFeetInches(6.0625, { precision: 4 })).toBe('6"');
  });
  it("rejects a non-positive precision", () => {
    expect(formatFeetInches(6.5, { precision: 0 })).toBe("—");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/utils/__tests__/feetInches.test.js
```

Expected: FAIL — `Failed to resolve import "../feetInches"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/feetInches.js`:

```js
/**
 * feetInches.js — the canonical formatter for a MEASURED length.
 *
 * Input is decimal INCHES (what the drawing viewer has after multiplying
 * page-inches by drawings.markup_scale). Output is how a PM reads a dimension
 * off a shop drawing:
 *
 *   formatFeetInches(6.5)   → '6 1/2"'      (under 12" → bare inches)
 *   formatFeetInches(174)   → `14'-6"`      (12"+ → feet-inches)
 *   formatFeetInches(11.97) → `1'-0"`       (rounding carries into feet)
 *
 * Why this exists alongside three other length helpers: formatLength takes
 * integer 1/32" ticks and always shows feet; decimalFeetToFtIn takes decimal
 * FEET and always shows feet; decimalInchesToFraction takes inches and never
 * shows feet. None matches the viewer's contract. Do not add a fourth.
 *
 * The one subtlety: round to ticks BEFORE deciding which side of 12" we are
 * on. Branching on the raw value makes 11.97" print as 12" rather than 1'-0".
 */

import { reduceFraction } from "./fractionConversion";

/**
 * @param {number} decimalInches
 * @param {{ precision?: number, prefix?: string, emptyLabel?: string }} [opts]
 *        precision  — fractional denominator; 16 = nearest 1/16". Must be > 0.
 *        prefix     — rendered outside the sign (e.g. "~" for uncalibrated).
 *        emptyLabel — returned bare, without prefix, on invalid input.
 * @returns {string}
 */
export function formatFeetInches(decimalInches, opts = {}) {
  const { precision = 16, prefix = "", emptyLabel = "—" } = opts;

  const value = Number(decimalInches);
  if (!Number.isFinite(value)) return emptyLabel;
  if (!Number.isFinite(precision) || precision <= 0) return emptyLabel;

  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);

  // Round to ticks first — this is what makes the foot-carry fall out for free.
  const totalTicks = Math.round(magnitude * precision);
  const wholeInches = Math.floor(totalTicks / precision);
  const remainderTicks = totalTicks - wholeInches * precision;

  const reduced = reduceFraction(remainderTicks, precision);
  const fraction = reduced && reduced.num > 0 ? ` ${reduced.num}/${reduced.den}` : "";

  let body;
  if (wholeInches < 12) {
    // Always show the integer, including 0 — `0 3/16"` reads better on a
    // detail than a bare `3/16"`.
    body = `${wholeInches}${fraction}"`;
  } else {
    const feet = Math.floor(wholeInches / 12);
    const inches = wholeInches % 12;
    body = `${feet}'-${inches}${fraction}"`;
  }

  return `${prefix}${sign}${body}`;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npm test -- src/utils/__tests__/feetInches.test.js
```

Expected: PASS, all cases green. The `never emits an inch component of 12 or
more` case sweeps every 1/16" tick from 0" to 60" — if the carry is wrong it
will fail there, not on a hand-picked value.

- [ ] **Step 5: Commit**

```bash
git add src/utils/feetInches.js src/utils/__tests__/feetInches.test.js
git commit -m "feat(utils): add formatFeetInches — canonical ft-in formatter to 1/16\"

Rounds to ticks before banding on 12\", so 11.97\" renders 1'-0\" rather than
12\". Built on the existing reduceFraction export rather than a fourth gcd."
```

---

## Task 3: Extract and fix `formatMeasureLabel` (TDD)

`formatMeasureLabel` is currently a private function inside a `.jsx` component,
so it cannot be tested under the node Vitest environment without pulling in
React. Move it to a pure module — the repo's established pattern for keeping
derivations node-testable.

While moving it, fix the boundary bug: it branches `if (inches < 12)` on the raw
value, then applies `.toFixed(1)`. Anything in `[11.95, 12)` renders `12.0"`.

**Files:**
- Create: `src/components/drawings/viewer/measureLabel.js`
- Test: `src/components/drawings/viewer/__tests__/measureLabel.test.js`
- Modify: `src/components/drawings/viewer/AnnotationLayer.jsx` (delete 925–948, add import)

- [ ] **Step 1: Write the failing test**

Create `src/components/drawings/viewer/__tests__/measureLabel.test.js`:

```js
/**
 * Unit tests for measureLabel.js
 *
 * Two label modes:
 *   calibrated  → real feet-inches to the nearest 1/16"
 *   uncalibrated→ raw page inches, one decimal, "~" prefix
 *
 * pdfDist is in PDF points (1/72"). markup_scale is real_inches_per_pdf_inch.
 */

import { describe, it, expect } from "vitest";
import { formatMeasureLabel } from "../measureLabel";

const PT = 72; // one page inch

describe("formatMeasureLabel — calibrated", () => {
  it("converts page inches through the scale to feet-inches", () => {
    // 1 page inch at 1/8"=1'-0" (scale 96) = 96 real inches = 8'-0"
    expect(formatMeasureLabel(1 * PT, 96)).toBe(`8'-0"`);
  });
  it("renders bare inches under a foot", () => {
    // 0.5 page inch at 1"=1'-0" (scale 12) = 6 real inches
    expect(formatMeasureLabel(0.5 * PT, 12)).toBe('6"');
  });
  it("rounds to the nearest 1/16", () => {
    // 0.51 page inch at scale 12 = 6.12" → 6 2/16 = 6 1/8
    expect(formatMeasureLabel(0.51 * PT, 12)).toBe('6 1/8"');
  });
  it("carries into feet rather than printing 12 inches", () => {
    // 0.9975 page inch at scale 12 = 11.97" → 1'-0"
    expect(formatMeasureLabel(0.9975 * PT, 12)).toBe(`1'-0"`);
  });
});

describe("formatMeasureLabel — uncalibrated", () => {
  it("prefixes with ~ and stays decimal", () => {
    expect(formatMeasureLabel(8.3 * PT, null)).toBe('~8.3"');
  });
  it("does not round page inches to 16ths", () => {
    expect(formatMeasureLabel(2.25 * PT, null)).toBe('~2.3"');
  });
  it("rounds before banding on 12 inches (the boundary bug)", () => {
    // 11.97 page inches rounds to 12.0 → must read 1'-0.0", not 12.0"
    expect(formatMeasureLabel(11.97 * PT, null)).toBe(`~1'-0.0"`);
  });
  it("still renders large page distances as feet", () => {
    expect(formatMeasureLabel(14.5 * PT, null)).toBe(`~1'-2.5"`);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/components/drawings/viewer/__tests__/measureLabel.test.js
```

Expected: FAIL — `Failed to resolve import "../measureLabel"`.

- [ ] **Step 3: Create the module**

Create `src/components/drawings/viewer/measureLabel.js`:

```js
/**
 * measureLabel.js — turn a measured PDF distance into an engineer-friendly
 * label. Extracted from AnnotationLayer.jsx so it can be unit-tested under the
 * node Vitest environment (the component pulls in React).
 *
 * Calibrated (markup_scale set by the Calibrate tool, in real inches per PDF
 * inch): real-world feet-inches to the nearest 1/16".
 *
 * Uncalibrated: raw page inches with a "~" prefix, one decimal, so the user
 * knows they are looking at paper, not steel. Deliberately NOT rounded to
 * 16ths — a 1/16" fraction on an uncalibrated page inch would be false
 * precision.
 */

import { formatFeetInches } from "@/utils/feetInches";

const POINTS_PER_INCH = 72;

/**
 * @param {number} pdfDist  distance in PDF points (1/72")
 * @param {number|null} scale  real_inches_per_pdf_inch, or null/0 if uncalibrated
 * @returns {string}
 */
export function formatMeasureLabel(pdfDist, scale) {
  const pdfInches = pdfDist / POINTS_PER_INCH;

  if (scale) return formatFeetInches(pdfInches * scale);

  // Round to one decimal BEFORE banding on 12", or 11.97 page inches prints
  // as 12.0" instead of 1'-0.0".
  const rounded = Math.round(pdfInches * 10) / 10;
  if (rounded < 12) return `~${rounded.toFixed(1)}"`;
  const feet = Math.floor(rounded / 12);
  const remainder = rounded - feet * 12;
  return `~${feet}'-${remainder.toFixed(1)}"`;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npm test -- src/components/drawings/viewer/__tests__/measureLabel.test.js
```

Expected: PASS, all cases green.

- [ ] **Step 5: Wire the component to the module**

In `src/components/drawings/viewer/AnnotationLayer.jsx`, delete the entire
JSDoc block and function at lines 925–948 (from `/**` above
`Format a distance in PDF user units` through the closing `}` of
`formatMeasureLabel`). Add to the import block at the top of the file:

```js
import { formatMeasureLabel } from "./measureLabel";
```

The three call sites (lines ~524, ~525, ~724) keep the same signature and need
no edit.

- [ ] **Step 6: Verify nothing else referenced the private function**

```bash
grep -rn "formatMeasureLabel" src/
```

Expected: exactly four hits — the definition in `measureLabel.js`, the import in
`AnnotationLayer.jsx`, and the three call sites. Plus the test file.

- [ ] **Step 7: Run the whole viewer suite**

```bash
npm test -- src/components/drawings/viewer/
```

Expected: PASS. `annotationGeometry.test.js`, `markupStatus.test.js`,
`scaleParse.test.js`, `storageUrl.test.js` must all stay green.

- [ ] **Step 8: Commit**

```bash
git add src/components/drawings/viewer/measureLabel.js \
        src/components/drawings/viewer/__tests__/measureLabel.test.js \
        src/components/drawings/viewer/AnnotationLayer.jsx
git commit -m "fix(viewer): measurement labels read ft-in to 1/16\"

Extract formatMeasureLabel from AnnotationLayer.jsx into a pure, node-testable
module. Calibrated labels now use formatFeetInches. Fixes a boundary bug where
any value in [11.95, 12) rendered 12.0\" instead of 1'-0\" because the < 12
branch tested the unrounded value."
```

---

## Task 4: Per-page scale detection with an ambiguous state (TDD)

Today `detectScaleFromPdf(pdfDoc)` scans pages `1..N` and returns the first
match anywhere. A sheet on page 18 inherits page 1's scale. That is the
"wrong number" symptom.

Two facts, verified, that contradict the file's own comments:

- `ARCH_SCALES` is ordered **smallest** `real_inches_per_pdf_inch` first
  (`scale: 4` is `3"=1'-0"`). "First match wins" therefore returns the *largest
  drawing scale* printed on the page — a `1/2"` detail beats a `1/4"` plan.
  Text position is irrelevant. The comment at line 29 ("usually the dominant
  one") is wrong.
- The `1:N` metric ratio is **unit-independent** and dimensionally correct for
  mm and inch drawings alike. The comment at lines 111–115 claiming it is wrong
  for mm is mistaken. Low confidence is about false positives (key maps,
  revision ratios), not units.

A detail sheet reading `SCALE: AS NOTED` alongside one detail's scale must be
treated as **ambiguous**, not as that one scale. That is the whole point of the
owner's decision: never hand a fabricator a confidently wrong number.

**Files:**
- Modify: `src/components/drawings/viewer/detectScale.js`
- Test: `src/components/drawings/viewer/__tests__/detectScale.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/components/drawings/viewer/__tests__/detectScale.test.js`:

```js
/**
 * Unit tests for detectScale.js — previously untested.
 *
 * A fake pdfDoc stands in for pdfjs: only numPages and getPage().getTextContent()
 * are exercised. Text is supplied per page so we can assert that detection reads
 * the SHEET's page (drawings.pdf_page), not page 1.
 */

import { describe, it, expect } from "vitest";
import { detectScaleForPage, detectScaleForDrawing } from "../detectScale";

/** @param {string[]} pageTexts  one entry per page, 1-based when indexed */
function fakePdf(pageTexts) {
  return {
    numPages: pageTexts.length,
    getPage: async (p) => ({
      getTextContent: async () => ({
        items: pageTexts[p - 1] == null ? [] : [{ str: pageTexts[p - 1] }],
      }),
    }),
  };
}

describe("detectScaleForPage — single match", () => {
  it("detects a quarter-inch plan scale", async () => {
    const pdf = fakePdf([`SCALE: 1/4" = 1'-0"`]);
    const r = await detectScaleForPage(pdf, 1);
    expect(r.status).toBe("single");
    expect(r.scale).toBe(48);
    expect(r.confidence).toBe("high");
    expect(r.page).toBe(1);
  });

  it("detects an eighth-inch scale", async () => {
    const r = await detectScaleForPage(fakePdf([`SCALE: 1/8" = 1'-0"`]), 1);
    expect(r.scale).toBe(96);
  });
});

describe("detectScaleForPage — reads the requested page, not page 1", () => {
  it("ignores page 1's scale when asked for page 3", async () => {
    const pdf = fakePdf([
      `SCALE: 1/8" = 1'-0"`,   // page 1 — cover/plan
      `no scale here`,          // page 2
      `SCALE: 1" = 1'-0"`,     // page 3 — the sheet we opened
    ]);
    const r = await detectScaleForPage(pdf, 3);
    expect(r.status).toBe("single");
    expect(r.scale).toBe(12);
    expect(r.page).toBe(3);
  });
});

describe("detectScaleForPage — ambiguous", () => {
  it("refuses when two distinct arch scales appear on one sheet", async () => {
    const pdf = fakePdf([`SECTION 1/2" = 1'-0"   ELEVATION 1/4" = 1'-0"`]);
    const r = await detectScaleForPage(pdf, 1);
    expect(r.status).toBe("ambiguous");
    expect(r.reason).toBe("multiple");
    expect(r.candidates).toHaveLength(2);
  });

  it("does not call one scale printed twice ambiguous", async () => {
    const r = await detectScaleForPage(fakePdf([`1/4" = 1'-0"  and again 1/4" = 1'-0"`]), 1);
    expect(r.status).toBe("single");
    expect(r.scale).toBe(48);
  });

  // Regression: the 1/2" pattern matches inside the literal `1 1/2" = 1'-0"`.
  // A naive "collect every match" reports this lone scale as two.
  it("does not mistake the 1/2 inside 1 1/2 for a second scale", async () => {
    const r = await detectScaleForPage(fakePdf([`DETAIL A   1 1/2" = 1'-0"`]), 1);
    expect(r.status).toBe("single");
    expect(r.scale).toBe(8);
  });

  // ...but a genuine standalone 1/2" elsewhere on the sheet IS a second scale.
  it("still detects a standalone 1/2 alongside a 1 1/2", async () => {
    const pdf = fakePdf([`DETAIL A  1 1/2" = 1'-0"    DETAIL B  1/2" = 1'-0"`]);
    const r = await detectScaleForPage(pdf, 1);
    expect(r.status).toBe("ambiguous");
    expect(r.reason).toBe("multiple");
    expect(r.candidates).toHaveLength(2);
  });

  it("refuses on SCALE: AS NOTED", async () => {
    const r = await detectScaleForPage(fakePdf([`SCALE: AS NOTED`]), 1);
    expect(r.status).toBe("ambiguous");
    expect(r.reason).toBe("as_noted");
  });

  it("refuses on AS NOTED even when one scale is also printed", async () => {
    const pdf = fakePdf([`SCALE: AS NOTED     DETAIL A  1 1/2" = 1'-0"`]);
    const r = await detectScaleForPage(pdf, 1);
    expect(r.status).toBe("ambiguous");
    expect(r.reason).toBe("as_noted");
  });

  it("refuses on NOT TO SCALE", async () => {
    const r = await detectScaleForPage(fakePdf([`DETAIL — NOT TO SCALE`]), 1);
    expect(r.status).toBe("ambiguous");
    expect(r.reason).toBe("nts");
  });
});

describe("detectScaleForPage — none", () => {
  it("reports no_text for a rasterized page", async () => {
    const r = await detectScaleForPage(fakePdf([""]), 1);
    expect(r.status).toBe("none");
    expect(r.reason).toBe("no_text");
  });

  it("reports no_match when text has no scale", async () => {
    const r = await detectScaleForPage(fakePdf(["GENERAL NOTES  SEE SHEET S001"]), 1);
    expect(r.status).toBe("none");
    expect(r.reason).toBe("no_match");
  });
});

describe("detectScaleForPage — metric", () => {
  it("returns metric at low confidence, never as a single high-confidence hit", async () => {
    const r = await detectScaleForPage(fakePdf(["SCALE 1:100"]), 1);
    expect(r.status).toBe("metric");
    expect(r.scale).toBe(100);
    expect(r.confidence).toBe("low");
  });

  it("prefers an architectural scale over a metric ratio on the same page", async () => {
    const r = await detectScaleForPage(fakePdf([`SCALE: 1/4" = 1'-0"   KEY MAP 1:500`]), 1);
    expect(r.status).toBe("single");
    expect(r.scale).toBe(48);
  });
});

describe("detectScaleForDrawing", () => {
  it("uses the drawing's pdf_page", async () => {
    const pdf = fakePdf([`1/8" = 1'-0"`, `1" = 1'-0"`]);
    const r = await detectScaleForDrawing(pdf, 2);
    expect(r.scale).toBe(12);
  });

  it("clamps a pdf_page beyond the document", async () => {
    const pdf = fakePdf([`1/4" = 1'-0"`]);
    const r = await detectScaleForDrawing(pdf, 99);
    expect(r.page).toBe(1);
    expect(r.scale).toBe(48);
  });

  it("falls back to a whole-document scan when pdf_page is null", async () => {
    const pdf = fakePdf(["no scale", `1/2" = 1'-0"`]);
    const r = await detectScaleForDrawing(pdf, null);
    expect(r.status).toBe("single");
    expect(r.scale).toBe(24);
    expect(r.page).toBe(2);
  });

  it("returns none when a whole-document fallback finds nothing", async () => {
    const r = await detectScaleForDrawing(fakePdf(["a", "b"]), null);
    expect(r.status).toBe("none");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/components/drawings/viewer/__tests__/detectScale.test.js
```

Expected: FAIL — `detectScaleForPage is not a function`.

- [ ] **Step 3: Rewrite the detection core**

In `src/components/drawings/viewer/detectScale.js`, first correct the two wrong
comments. Replace the block at lines 22–35 (`Limitations:` through the
`// Ordered largest-to-smallest ...` comment) with:

```js
 * Limitations:
 *   - Only US customary (feet-inch) architectural scales, plus a low-confidence
 *     metric 1:N fallback.
 *   - No OCR: a title block that is a raster image yields no text layer.
 *   - A sheet printing several scales (plan at 1/4, detail at 1/2) is reported
 *     as AMBIGUOUS, not guessed at. Same for "AS NOTED" / "NTS". The user
 *     calibrates manually. We would rather show nothing than a wrong number a
 *     fabricator might cut steel to.
 */

// Ordered by drawing scale, largest first — equivalently, SMALLEST
// real-inches-per-pdf-inch first (scale: 4 is 3"=1'-0"). We now collect every
// distinct match on a page rather than taking the first, so this ordering only
// determines the order of `candidates`.
```

Then replace `NTS_RE` (line 59) and append the new API. Keep `ARCH_SCALES` and
`METRIC_RE` exactly as they are.

```js
// Bare NTS / NOT TO SCALE anywhere in the text.
const NTS_RE = /\b(?:not\s+to\s+scale|\bNTS\b)\b/i;

// An explicit "SCALE: AS NOTED" / "SCALE — VARIES" style marker. Anchored on
// the word SCALE so we don't fire on prose. Detail sheets print this next to a
// per-detail scale, which is exactly the case we must refuse to guess at.
const AS_NOTED_RE = /\bscale\b[^a-z0-9]{0,8}(?:as\s+noted|as\s+shown|varies)\b/i;

/** Concatenated text layer of one 1-based page. "" when there is none. */
async function pageText(pdfDoc, pageNumber) {
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const content = await page.getTextContent();
    return (content.items || [])
      .map((it) => it.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return ""; // rasterized page, or a page that failed to parse
  }
}

/**
 * Detect the scale printed on ONE page.
 *
 * Never returns a bare number — always a status, so callers can distinguish
 * "this sheet says 1/4 inch" from "this sheet refuses to say".
 *
 * @returns {Promise<
 *   | { status:'single',    scale:number, label:string, page:number, source:string, confidence:'high' }
 *   | { status:'metric',    scale:number, label:string, page:number, source:string, confidence:'low' }
 *   | { status:'ambiguous', reason:'multiple'|'as_noted'|'nts', page:number, candidates:string[] }
 *   | { status:'none',      reason:'no_text'|'no_match', page:number }
 * >}
 */
export async function detectScaleForPage(pdfDoc, pageNumber) {
  const text = await pageText(pdfDoc, pageNumber);
  if (!text) return { status: "none", reason: "no_text", page: pageNumber };

  // Collect EVERY distinct architectural scale on the page. A detail sheet with
  // a section at 1 1/2" and an elevation at 3/4" must not silently become one.
  //
  // Overlap guard: the 1/2" pattern also matches INSIDE the literal
  // `1 1/2" = 1'-0"`. ARCH_SCALES is ordered largest-drawing-scale first, so
  // 1 1/2" is accepted first; any later pattern whose match falls inside an
  // already-accepted span is a substring artefact, not a second scale. Without
  // this, a sheet printing only 1 1/2"=1'-0" would report itself ambiguous.
  const hits = [];
  for (const s of ARCH_SCALES) {
    const re = new RegExp(s.re.source, s.re.flags.includes("g") ? s.re.flags : `${s.re.flags}g`);
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const overlaps = hits.some((h) => start < h.end && end > h.start);
      if (!overlaps) {
        hits.push({ scale: s.scale, label: s.label, source: m[0], start, end });
        break; // one accepted occurrence per scale is enough
      }
      // else: keep scanning — this pattern may also occur standalone elsewhere
    }
  }

  if (hits.length > 1) {
    return {
      status: "ambiguous",
      reason: "multiple",
      page: pageNumber,
      candidates: hits.map((h) => h.label),
    };
  }

  // An explicit AS NOTED / NTS marker outranks a lone scale: the sheet is
  // telling us its details each carry their own scale.
  if (AS_NOTED_RE.test(text)) {
    return {
      status: "ambiguous",
      reason: "as_noted",
      page: pageNumber,
      candidates: hits.map((h) => h.label),
    };
  }
  if (NTS_RE.test(text)) {
    return {
      status: "ambiguous",
      reason: "nts",
      page: pageNumber,
      candidates: hits.map((h) => h.label),
    };
  }

  if (hits.length === 1) {
    const h = hits[0];
    return {
      status: "single",
      scale: h.scale,
      label: h.label,
      page: pageNumber,
      source: h.source,
      confidence: "high",
    };
  }

  // Metric 1:N. The ratio is unit-independent — correct for mm AND inch
  // drawings. It is low confidence because "1:500" is just as likely to be a
  // key map or a revision ratio as the sheet's scale. Confirm before applying.
  const metric = text.match(METRIC_RE);
  if (metric) {
    const ratio = parseInt(metric[1], 10);
    if (ratio >= 5 && ratio <= 5000) {
      return {
        status: "metric",
        scale: ratio,
        label: `1:${ratio}`,
        page: pageNumber,
        source: metric[0],
        confidence: "low",
      };
    }
  }

  return { status: "none", reason: "no_match", page: pageNumber };
}

/**
 * Detect the scale for a DRAWING ROW.
 *
 * A drawings row points at its own page inside a multi-page set PDF. Read THAT
 * page — reading page 1 is the bug this replaces. When pdf_page is null or 0
 * (single-master PDFs, legacy rows), fall back to a whole-document scan and
 * take the first page that yields an unambiguous single match.
 *
 * @param {object} pdfDoc
 * @param {number|null|undefined} pdfPage  drawings.pdf_page (1-based)
 */
export async function detectScaleForDrawing(pdfDoc, pdfPage) {
  if (!pdfDoc || typeof pdfDoc.getPage !== "function") {
    return { status: "none", reason: "no_text", page: 1 };
  }
  const total = pdfDoc.numPages || 1;

  const requested = Number(pdfPage);
  if (Number.isFinite(requested) && requested >= 1) {
    return detectScaleForPage(pdfDoc, Math.min(Math.trunc(requested), total));
  }

  let firstNonSingle = null;
  for (let p = 1; p <= total; p++) {
    const r = await detectScaleForPage(pdfDoc, p);
    if (r.status === "single") return r;
    if (!firstNonSingle && r.status !== "none") firstNonSingle = r;
  }
  return firstNonSingle || { status: "none", reason: "no_match", page: 1 };
}
```

Finally, delete the old `detectScaleFromPdf` export (lines 61–130 of the
original file) — Task 5 removes its last two callers.

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npm test -- src/components/drawings/viewer/__tests__/detectScale.test.js
```

Expected: PASS, all cases green — including the two overlap-guard cases, which
are the ones that catch a naive "collect every regex match".

- [ ] **Step 5: Confirm no caller still imports the deleted function**

```bash
grep -rn "detectScaleFromPdf" src/
```

Expected: two hits, both in `src/pages/drawingViewer/useAutoScaleOnLoad.js`.
Task 5 replaces them. Do not commit until Task 5 lands, or the app will not
build — combine this commit with Task 5's.

---

## Task 5: Rewire the auto-detect hook

Three changes: call per-page; auto-apply only an unambiguous high-confidence
single; persist `scale_status` so Undo actually sticks. Today Undo writes
`markup_scale = null`, and the on-load effect's gate is `if
(activeDrawing.markup_scale) return;` — so next session the same wrong scale is
re-applied. The per-session `useRef` Set does not survive a reload.

**Files:**
- Modify: `src/pages/drawingViewer/useAutoScaleOnLoad.js`

- [ ] **Step 1: Replace the file**

```js
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { detectScaleForDrawing } from "@/components/drawings/viewer/detectScale";

// Auto-detect scale from the PDF's title-block text layer. Two paths:
//
//   1. Toolbar AUTO button → handleAutoDetectScale(). Explicit, always reports
//      what it found, including "ambiguous" and "nothing".
//   2. Automatic on-load effect. Fires once per uncalibrated drawing. Applies
//      ONLY an unambiguous high-confidence architectural scale, with an UNDO.
//
// Detection reads the DRAWING'S OWN PAGE (drawings.pdf_page). It used to scan
// from page 1 of the set PDF and return the first match anywhere, so a sheet on
// page 18 inherited the cover sheet's scale.
//
// scale_status makes a NULL markup_scale legible:
//   'auto'       — we detected and applied it
//   'manual'     — the user calibrated, or undid our guess. Never auto-apply again.
//   'ambiguous'  — the sheet prints several scales, or says AS NOTED / NTS.
//   'undetected' — we looked and found nothing.
export function useAutoScaleOnLoad({ activeDrawing, pdfDoc, projectId, qc }) {
  const describe = (hit) => {
    if (hit.status === "ambiguous") {
      const list = hit.candidates?.length ? ` (${hit.candidates.join(", ")})` : "";
      if (hit.reason === "multiple") return `This sheet prints several scales${list}. Calibrate (K) to set one.`;
      if (hit.reason === "as_noted") return `This sheet says "AS NOTED"${list}. Calibrate (K) on the detail you're measuring.`;
      return `This sheet is marked NOT TO SCALE. Calibrate (K) to measure anyway.`;
    }
    return "No scale found in the PDF text layer. Use Calibrate (K) to set one.";
  };

  const handleAutoDetectScale = useCallback(async () => {
    if (!activeDrawing?.id || !pdfDoc) return;
    try {
      const hit = await detectScaleForDrawing(pdfDoc, activeDrawing.pdf_page);

      if (hit.status === "ambiguous") {
        await entities.Drawing.update(activeDrawing.id, { scale_status: "ambiguous" });
        qc.invalidateQueries({ queryKey: ["drawings", projectId] });
        toast.warning(describe(hit));
        return;
      }
      if (hit.status === "none") {
        await entities.Drawing.update(activeDrawing.id, { scale_status: "undetected" });
        qc.invalidateQueries({ queryKey: ["drawings", projectId] });
        toast.info(describe(hit));
        return;
      }

      // 'single' (high) or 'metric' (low). The explicit button may apply a
      // metric ratio; the on-load path below never does.
      await entities.Drawing.update(activeDrawing.id, {
        markup_scale: hit.scale,
        scale_status: "auto",
      });
      qc.invalidateQueries({ queryKey: ["drawings", projectId] });
      const caveat = hit.confidence === "high" ? "" : " (low confidence — verify with Calibrate)";
      toast.success(`Detected scale ${hit.label} on page ${hit.page}${caveat}`);
    } catch (err) {
      toast.error(`Auto-detect failed: ${err.message}`);
    }
  }, [activeDrawing, pdfDoc, projectId, qc]);

  // Fire once per uncalibrated drawing per session. The ref only dedupes within
  // a session; scale_status is what makes a decline durable across reloads.
  const autoScaleAttemptedRef = useRef(new Set());
  useEffect(() => {
    if (!pdfDoc || !activeDrawing?.id) return;
    if (activeDrawing.markup_scale) return;
    if (activeDrawing.scale_status === "manual" || activeDrawing.scale_status === "ambiguous") return;
    if (autoScaleAttemptedRef.current.has(activeDrawing.id)) return;
    autoScaleAttemptedRef.current.add(activeDrawing.id);

    let cancelled = false;
    (async () => {
      try {
        const hit = await detectScaleForDrawing(pdfDoc, activeDrawing.pdf_page);
        if (cancelled) return;

        // Record a refusal so we stop re-arming on every reload.
        if (hit.status === "ambiguous" || hit.status === "none") {
          await entities.Drawing.update(activeDrawing.id, {
            scale_status: hit.status === "ambiguous" ? "ambiguous" : "undetected",
          });
          if (!cancelled) qc.invalidateQueries({ queryKey: ["drawings", projectId] });
          return;
        }

        // Silent auto-apply is only ever safe for an unambiguous architectural
        // scale read off this sheet's own page. Metric stays confirm-then-apply.
        if (hit.status !== "single" || hit.confidence !== "high") return;

        await entities.Drawing.update(activeDrawing.id, {
          markup_scale: hit.scale,
          scale_status: "auto",
        });
        if (cancelled) return;
        qc.invalidateQueries({ queryKey: ["drawings", projectId] });

        const drawingIdForUndo = activeDrawing.id;
        toast.success(`Auto-detected scale ${hit.label}`, {
          duration: 8000,
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                // 'manual' — the user has taken control. Never auto-apply here again.
                await entities.Drawing.update(drawingIdForUndo, {
                  markup_scale: null,
                  scale_status: "manual",
                });
                qc.invalidateQueries({ queryKey: ["drawings", projectId] });
                toast.info("Scale reset — use Calibrate (K) to set it manually.");
              } catch (err) {
                toast.error(`Undo failed: ${err.message}`);
              }
            },
          },
        });
      } catch {
        // Silent — the on-load path must not spam. The AUTO button reports.
      }
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, activeDrawing?.id, activeDrawing?.markup_scale, activeDrawing?.scale_status, activeDrawing?.pdf_page, projectId, qc]);

  return { handleAutoDetectScale };
}
```

- [ ] **Step 2: Confirm the old function is gone everywhere**

```bash
grep -rn "detectScaleFromPdf" src/
```

Expected: no hits.

- [ ] **Step 3: Run the full suite and the linter**

```bash
npm test
npm run lint
```

Expected: PASS, and lint clean. Every pre-existing test must still be green —
you changed a shared formatter and a shared detector, so a failure elsewhere is
signal, not noise.

- [ ] **Step 4: Commit Tasks 4 and 5 together**

```bash
git add src/components/drawings/viewer/detectScale.js \
        src/components/drawings/viewer/__tests__/detectScale.test.js \
        src/pages/drawingViewer/useAutoScaleOnLoad.js
git commit -m "fix(viewer): detect scale on the sheet's own page; refuse to guess

detectScaleFromPdf scanned from page 1 and returned the first architectural
scale anywhere in the set PDF, so a sheet on page 18 inherited the cover
sheet's scale. Replace with detectScaleForDrawing, which reads drawings.pdf_page
(clamped, with a whole-document fallback for null pages).

A sheet printing several scales, or marked AS NOTED / NTS, is now reported as
ambiguous rather than silently resolved to one of them — a wrong scale on a
detail is steel cut to the wrong length. scale_status persists a refusal so the
on-load effect stops re-applying a guess the user already undid.

Adds the module's first tests (16); corrects two wrong comments: ARCH_SCALES is
ordered smallest-inches-per-pdf-inch first, and a metric 1:N ratio is
unit-independent, not 'wrong for mm'."
```

---

## Task 6: Surface the ambiguous state in the UI

A detection that refuses to guess is only useful if the user can see it refused.

**Files:**
- Modify: `src/pages/drawingViewer/ViewerToolbar.jsx:139-156`
- Modify: `src/pages/DrawingViewer.jsx` (pass `scaleStatus`; stamp `manual` on calibrate)

- [ ] **Step 1: Add the `scaleStatus` prop to the toolbar**

In `src/pages/drawingViewer/ViewerToolbar.jsx`, add `scaleStatus,` to the props
destructure immediately after `markupScale,` (line 36).

Replace lines 139–156 with:

```jsx
      {pdfDoc && (
        <div style={toolbarGroupStyle}>
          <span
            title={
              markupScale
                ? `Calibrated scale. 1 PDF inch = ${markupScale.toFixed(1)} real inches.`
                : scaleStatus === "ambiguous"
                  ? "This sheet prints more than one scale, or is marked AS NOTED / NTS. Measurements would be wrong. Calibrate (K) on the detail you're measuring."
                  : "No scale calibrated. The measure tool shows approximate page inches."
            }
            style={scaleBadgeStyle(!!markupScale)}
          >
            {markupScale
              ? formatScaleFraction(markupScale)
              : scaleStatus === "ambiguous"
                ? "Ambiguous ⚠"
                : "No Scale"}
          </span>
          <ToolbarButton
            disabled={!activeDrawing?.id}
            onClick={handleAutoDetectScale}
            title="Scan this sheet's title block and try to auto-detect its scale"
            label="Auto Scale"
          />
        </div>
      )}
```

- [ ] **Step 2: Pass it from the page**

In `src/pages/DrawingViewer.jsx`, immediately after line 140
(`const markupScale = activeDrawing?.markup_scale || null;`) add:

```js
  const scaleStatus = activeDrawing?.scale_status || null;
```

Then add `scaleStatus={scaleStatus}` to the `<ViewerToolbar …>` props, next to
the existing `markupScale={markupScale}` at line 531.

Do **not** add it to the `<AnnotationLayer>` props at line 777 — the annotation
layer only needs the numeric scale.

- [ ] **Step 3: Stamp `scale_status` when the user calibrates**

In `src/pages/DrawingViewer.jsx`, in `handleCalibrate`, replace line 213:

```js
      await entities.Drawing.update(activeDrawing.id, { markup_scale: scale });
```

with:

```js
      // 'manual' — the user set this by hand. The on-load auto-detect must
      // never overwrite it, even if this sheet later reads as ambiguous.
      await entities.Drawing.update(activeDrawing.id, {
        markup_scale: scale,
        scale_status: "manual",
      });
```

- [ ] **Step 4: Regenerate the Supabase types**

`src/types/supabase.ts` is already modified in the working tree by another
change — regenerate rather than hand-edit, then review the diff to confirm the
only addition is `scale_status` on `drawings`.

Use the Supabase MCP `generate_typescript_types` tool with
`project_id: kjrwqagyeswwoxpjkcko`, write the result to `src/types/supabase.ts`,
then:

```bash
git diff --stat src/types/supabase.ts
npm run build
```

Expected: build succeeds. If `typecheck:strict` or `typecheck:noimplicitany` run
in CI complain about the new nullable column, add it to the existing ignore
lists only as a last resort — the goal is to shrink those lists, not grow them.

- [ ] **Step 5: Run the full suite, lint, and build**

```bash
npm test
npm run lint
npm run build
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/pages/drawingViewer/ViewerToolbar.jsx src/pages/DrawingViewer.jsx src/types/supabase.ts
git commit -m "feat(viewer): badge ambiguous-scale sheets; mark manual calibration

The scale badge gains an 'Ambiguous ⚠' state for sheets that print several
scales or read AS NOTED / NTS, so the user knows to calibrate on the specific
detail rather than trusting a sheet-wide number. Calibrating by hand now records
scale_status='manual', which stops auto-detect from ever overwriting it."
```

---

## Task 6A: Escalate save failures to a toast

Owner decision, 2026-07-10. Today a rejected write rolls back the optimistic
mark and shows only `⚠ SAVE FAILED` in a **collapsible** toolbar
(`useMarkup.js:110–124`, `AnnotationToolbar.jsx:266–267`). With the toolbar
collapsed the user just watches their markup vanish — which is precisely how
the CHECK-constraint bug survived unreported for a month.

**Files:**
- Modify: `src/components/drawings/viewer/useMarkup.js`

- [ ] **Step 1: Add the toast import**

`useMarkup.js` does not import `sonner` today. Add it after line 32
(`useRealtimeInvalidation`), matching the import style already in the file:

```js
import { toast } from "sonner";
```

- [ ] **Step 2: Toast inside `trackOp`'s catch**

Replace the `catch (err)` block of `trackOp` (currently lines 115–120):

```js
    } catch (err) {
      setSaveError(err?.message || "Save failed");
      // Refetch server truth so the optimistic cache can't drift after a
      // rejected write (lock, RLS, network).
      qc.invalidateQueries({ queryKey });
      throw err;
    } finally {
```

with:

```js
    } catch (err) {
      const message = err?.message || "Save failed";
      setSaveError(message);
      // The toolbar's ⚠ SAVE FAILED is collapsible, so a rejected write could
      // look like the mark simply vanishing. Escalate. A stable toast id means
      // a debounced burst of failing text edits shows one toast, not twenty.
      toast.error(
        /DRAWING_SET_LOCKED/.test(message)
          ? "This drawing set is locked from edits. Unlock the set to mark it up."
          : `Markup not saved — ${message}`,
        { id: `markup-save-failed-${drawingId}` },
      );
      // Refetch server truth so the optimistic cache can't drift after a
      // rejected write (lock, RLS, network).
      qc.invalidateQueries({ queryKey });
      throw err;
    } finally {
```

- [ ] **Step 3: Add `drawingId` to `trackOp`'s dependency array**

`trackOp` currently closes over `[qc, queryKey]`. The toast id now reads
`drawingId`, so the dep array must become `[qc, queryKey, drawingId]`. Verify
the lint rule `react-hooks/exhaustive-deps` is satisfied.

- [ ] **Step 4: Verify no toast storm on the debounced path**

Text edits debounce at `UPDATE_DEBOUNCE_MS = 450`. Confirm the stable
`id` collapses repeated failures into one toast: temporarily make an update
throw (e.g. edit a note on a locked set), type several characters, and confirm
exactly one toast is visible at a time.

- [ ] **Step 5: Test, lint, commit**

```bash
npm test -- src/components/drawings/viewer/
npm run lint
git add src/components/drawings/viewer/useMarkup.js
git commit -m "fix(viewer): surface markup save failures as a toast

A rejected write rolled back the optimistic mark and reported only through a
collapsible toolbar indicator, so markup appeared to vanish silently. That is
how the drawing_markups CHECK bug went unreported for a month."
```

---

## Task 6B: Scale badge + detection outside canvas mode

Owner decision, 2026-07-10: scale detection should run "any time a drawing is
being viewed," not canvas-only. Two halves, with very different costs.

**Read this before starting.** `renderMode` is `"canvas"` (pdfjs) or `"iframe"`
(browser-native PDF, no annotation layer). Iframe mode is reachable two ways: a
deliberate toggle, and as the **fallback after `pdfError`** —
`DrawingViewer.jsx:708–718` renders "Switch to browser PDF" when pdfjs failed to
load the file. So in iframe mode pdfjs may be *unable* to parse this PDF at all.
A detection failure must therefore never surface an error over a document the
browser is happily rendering.

**Files:**
- Modify: `src/pages/drawingViewer/ViewerToolbar.jsx`
- Modify: `src/pages/drawingViewer/usePdfLoader.js`

- [ ] **Step 1: The badge needs no PDF — ungate it**

The badge reads `markup_scale` / `scale_status` off the `drawings` row, not the
document. In `ViewerToolbar.jsx`, change the group's gate from `{pdfDoc && (`
to key on the drawing instead:

```jsx
      {activeDrawing?.file_url && (
```

Keep the `Auto Scale` button gated on the document, because auto-detect genuinely
needs it. Its `disabled` prop becomes:

```jsx
            disabled={!activeDrawing?.id || !pdfDoc}
            title={pdfDoc
              ? "Scan this sheet's title block and try to auto-detect its scale"
              : "Auto-detect needs the PDF parsed — switch to canvas mode"}
```

- [ ] **Step 2: Load the document for detection even in iframe mode**

In `usePdfLoader.js`, replace the effect at lines 59–84.

The document is loaded when canvas mode needs it to render, **or** when the
drawing is unresolved and we owe it a detection pass. Detection persists to the
`drawings` row, so this is a once-per-drawing cost, not once-per-view.

```js
  // Load the PDF when canvas mode needs it to render, OR when the drawing has
  // never been scale-resolved and we owe it one detection pass. Detection
  // persists (markup_scale / scale_status), so an unresolved drawing parses at
  // most once, not on every view.
  //
  // Iframe mode is also the fallback after a pdfError, meaning pdfjs may be
  // unable to parse this file at all. A detection-only load must therefore fail
  // SILENTLY — never surface an error over a PDF the browser is rendering fine.
  const needsDetection =
    activeDrawing?.markup_scale == null && activeDrawing?.scale_status == null;
  useEffect(() => {
    if (!resolvedUrl) return;
    const forRender = renderMode === "canvas";
    if (!forRender && !needsDetection) return;

    let cancelled = false;
    let loadingTask = null;

    loadingTask = pdfjsLib.getDocument(resolvedUrl);
    loadingTask.promise
      .then((doc) => {
        if (cancelled) { doc.destroy(); return; }
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        if (forRender) setPdfError(null);
      })
      .catch((err) => {
        // Only canvas mode has an error surface. In iframe mode the user is
        // already looking at the document; a failed detection parse is not
        // their problem.
        if (!cancelled && forRender) setPdfError(`PDF load failed: ${err.message}`);
      });

    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy?.();
      }
    };
  }, [resolvedUrl, renderMode, needsDetection]);
```

- [ ] **Step 3: Confirm the iframe render path is untouched**

`DrawingViewer.jsx:693–707` renders the `<iframe src={resolvedUrl}>` off
`resolvedUrl`, not `pdfDoc`. Loading `pdfDoc` in iframe mode must not change
what is rendered. Read those lines and confirm. Do not edit them.

- [ ] **Step 4: Confirm the canvas render path is untouched**

`usePdfRenderer.js:37` bails on `!pdfDoc || !canvasRef.current`, and the canvas
is only mounted when `renderMode === "canvas"` (`DrawingViewer.jsx:553`). So a
`pdfDoc` present in iframe mode renders nothing. Read and confirm. Do not edit.

- [ ] **Step 5: Verify manually**

```bash
npm run dev
```

Open an uncalibrated drawing, switch to browser-PDF mode, reload.

Expected: the scale badge appears in iframe mode showing `No Scale` or
`Ambiguous ⚠`; auto-detect runs once and persists; `Auto Scale` is disabled with
its explanatory tooltip. Then open an already-calibrated drawing in iframe mode
and confirm via the network tab that the PDF is **not** re-parsed by pdfjs (only
the iframe's own fetch occurs).

- [ ] **Step 6: Test, lint, build, commit**

```bash
npm test
npm run lint
npm run build
git add src/pages/drawingViewer/ViewerToolbar.jsx src/pages/drawingViewer/usePdfLoader.js
git commit -m "feat(viewer): show the scale badge and run detection outside canvas mode

The badge reads the drawings row, not the PDF, so it no longer hides in iframe
mode. Detection now parses the document in iframe mode too, but only for a
drawing that has never been resolved, and fails silently — iframe mode is the
fallback after pdfjs could not load the file."
```

---

## Task 7: Verify against the real app

Tests prove the units. Only the running app proves the fix.

**Files:** none

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Prove markup persists (the "it vanishes" symptom)**

Open a drawing in the viewer. Draw a **measurement**. Then reload the page.

Expected: the measurement is still there. Before this plan it vanished, because
the insert was rejected by the CHECK constraint.

Repeat for a **pen** stroke and a **cloud**. Confirm in-DB:

```sql
select markup_type, count(*) from public.drawing_markups group by markup_type;
```

Expected: rows for `measure`, `pen`, `cloud`.

- [ ] **Step 3: Prove the number is right**

On a sheet with a known dimension printed on it, calibrate (`K`) against that
dimension, then measure the same line.

Expected: the label reads back the printed dimension, in feet-inches, to the
nearest 1/16" — e.g. `14'-6"`. Not `14'-6.2"`. Not `~8.3"`.

- [ ] **Step 4: Prove the ambiguous badge fires**

Open `SE502` (`FRAMING DETAILS`, page 18 of its set) or `S6` (`TYPICAL STEEL
STAIR DETAILS`). These are detail sheets.

Expected: the badge reads `Ambiguous ⚠`, not a scale fraction, and the
auto-detect does **not** silently apply the cover sheet's `1/8"` plan scale.
Before this plan, `SE502` carried `markup_scale = 12` read off a different page.

- [ ] **Step 5: Prove Undo sticks**

On an uncalibrated sheet that does detect cleanly, let the auto-detect toast
appear and press **Undo**. Reload the page.

Expected: the sheet still reads `No Scale`. The detection does not re-apply.
Confirm:

```sql
select sheet_number, markup_scale, scale_status from public.drawings
where scale_status is not null order by sheet_number limit 10;
```

- [ ] **Step 6: Confirm the E2E gate is still green**

The fab-release Playwright spec is a P0 path and must not regress.

```bash
npm run test:e2e
```

Expected: PASS.

---

## Task 8: Ship and release the claim

- [ ] **Step 1: Push the verified SHA**

```bash
git fetch origin main
git rev-list --count "$(git rev-parse HEAD)..origin/main"   # must print 0
git push origin "$(git rev-parse HEAD):main"
```

If the count is not `0`, `git pull --rebase origin main`, re-run `npm test`, and
retry. Never force-push.

- [ ] **Step 2: Confirm the migration is actually in production**

CI does not run migrations, and a green deploy proves nothing about the
database. Re-run the Step 4 verification from Task 1 against
`project_id: kjrwqagyeswwoxpjkcko` and confirm the widened CHECK is live.

- [ ] **Step 3: Release the claim**

Delete your row from **Active claims** in `AGENT_CLAIMS.md`.

```bash
git add AGENT_CLAIMS.md
git commit -m "chore(claims): release measurement-ship1 (merged to main)"
git push origin "$(git rev-parse HEAD):main"
```

---

## Ship 2 preview (not this plan)

Vertex snapping. The spike already proved it viable — all four sampled sheets
are vector, 11k–33k unique anchors, 56–263 ms to parse and 6–14 ms to walk. The
extraction reference implementation (`getOperatorList` + CTM replay including
`paintFormXObjectBegin/End`) is in the spec. It will be planned separately once
Ship 1 is on `main`.
