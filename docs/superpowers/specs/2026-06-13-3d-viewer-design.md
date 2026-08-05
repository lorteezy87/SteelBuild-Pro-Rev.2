# 3D model viewer — self-hosted IFC, lazy-loaded (Detailing Control Center)

## Goal

Bring a 3D model viewer back into the **Detailing Control Center**
(`DrawingSubmittalHub.tsx`) as a new "3D Model" tab. Render an uploaded IFC and
**color each piece by its fabrication status**, reusing the `model_elements`
join + `modelElementStatus` engine already wired into that page. Self-hosted
(no Autodesk account / no per-model cost), and **lazy-loaded** so the heavy wasm
never touches users who don't open the tab — which fixes the reason the prior
viewer (`PortfolioBimViewer`, 1,796 lines, ~4MB wasm) was removed.

## Decisions (locked with the user)

- **Approach:** self-hosted IFC, lazy-loaded.
- **Library:** `web-ifc` (wasm IFC parser) + `three.js`, wrapped in a focused
  single-model viewer. NOT `@thatopen/components`/fragments — that stack's
  "worker-must-match-package-version → silent zero-geometry" footgun
  (CLAUDE.md §27) is the main thing that makes these viewers painful, and we
  don't need its big-model culling yet.
- **MVP scope:** upload IFC → **extract the assembly roster into `model_elements`
  (source='ifc', GlobalId)** → render → color by fab status → click a piece for
  its mark/status/links. Sequence playback, RFI pins, model↔sheet linking,
  multi-model, sectioning = deferred.
- **Verification:** against a real Tekla IFC export the user provides (ideally a
  job that already has `model_elements`/production data, to prove coloring).

## Sample IFC (verified 2026-06-13)

Job **25116 — ALA Apache Junction Education Building**, exported from Tekla
Structures 2024 (`...006  3D Model\061126_25116_ALA_EDUCATION BUILDING_3D MODEL.ifc`):

- **9.3 MB**, schema **IFC2X3** (CoordinationView 2.0), length unit **mm** (foot
  conversion units present — US job). Whole-model load is fine; no streaming needed.
- Geometry: **2,108 `IfcBeam` + 77 `IfcColumn` + 466 `IfcPlate` + 8 `IfcMember`**,
  grouped into **745 `IfcElementAssembly`**. (Also 539 bolts + welds — ignore for MVP.)
- **Marks confirmed in the `Part Properties` PSet:** `Assembly Mark`, `Part Mark`,
  `Referecnce Number (Preliminary/ABM Mark)` [sic], `Sequence (Phase)` (+ Name),
  `Is Main Part?`, `Name`. → color by `Assembly Mark`, fall back to `Part Mark`.
- The viewer's mark→status helper handles both keys + the unmatched case, so a
  job whose CSV "piece mark" turns out to be the part mark still colors correctly.

### Data reality — what's verifiable now

The project **"ALA Apache Junction"** exists but has **0 `model_elements` / 0
`piece_production`** today. So:

- **Render + click-to-identify**: fully verifiable against this IFC now (geometry
  + marks are in the file).
- **Status coloring**: the mark→status helper is unit-tested with synthetic data
  now; end-to-end coloring lights up once the job has status data. **Roster-from-
  IFC is in the MVP** (locked): on upload, extract the 745 assembly marks (+
  profile, sequence, `element_guid` = IFC GlobalId) → `model_elements`
  (`source='ifc'`). This populates the piece roster from the model itself,
  backfills the geometry↔join link the schema was built for, and makes coloring
  work the moment any status data (production import / manual) arrives — every
  piece shows "Not Started" until then. After that the user can import 25116's
  Tekla production CSV (existing Production Status import) to light up real colors.

## Architecture (units, each independently testable)

1. **`web-ifc` wasm version pinning (build).** `web-ifc`'s `.wasm` MUST match
   the installed JS version (same coupling class as the @thatopen worker). A
   build/copy step pulls `node_modules/web-ifc/*.wasm` into a served path and
   `IfcAPI.SetWasmPath()` points there, so versions can never drift. Lazy import
   means the wasm is fetched only on first 3D-tab open.

2. **Model storage + anchor.** Upload the IFC to Supabase Storage (project-
   scoped path) and register it in **`model_registry`** (reuse its
   `document_id` anchor + `superseded_by` versioning). The 3D tab loads the
   latest non-superseded model for the project and resolves a signed URL.
   - New: a small **ModelUploadModal** (mirrors `ModelElementImportModal`'s
     staged pattern) — pick IFC, upload, register. RLS write ≥ field.

3. **`IfcModelViewer` (lazy React component).** Owns the three.js scene. Given a
   signed IFC URL: `IfcAPI.OpenModel` → `LoadAllGeometry` → build meshes, keyed
   by `expressID`. Orbit/pan/zoom, fit-to-view, raycast picking. Pure-ish: takes
   `{ url, statusByPieceMark, onPick }`, owns no app data fetching.

4. **Piece-mark ↔ status bridge (pure helper, unit-tested).** For each IFC part,
   read its mark from the **`Part Properties`** PSet — **`Assembly Mark`**
   (primary; the shippable/erectable piece that production status tracks) with
   **`Part Mark`** as fallback (verified against the sample file below). Map mark
   → status via the existing `model_elements` + `modelElementStatus` read-model
   the page already computes. Color: Not Started (gray) / In Fab (blue) / Shipped
   (amber) / Erected (green) / Unmatched (neutral). `Sequence (Phase)` is also
   present → reserved for the deferred sequence-playback slice.

5. **3D tab in `DrawingSubmittalHub`.** Add a `TABS` entry "3D Model" that lazy-
   loads `IfcModelViewer` + an info side panel. Feed it the page's existing
   `modelElements` / status read-model. Empty state when no model uploaded
   (CTA → ModelUploadModal). The tab is gated behind a feature flag
   (`viewer_3d`) until verified against a real file.

6. **Pick → info panel.** Raycast hit → expressID → piece mark + matched
   `model_element` (status, linked drawing / work package / RFI from the join).

## Data flow

```
IFC (Storage) ──signed URL──▶ web-ifc parse (lazy chunk)
                                   │  per element: read piece mark
                                   ▼
model_elements + modelElementStatus ──▶ statusByPieceMark ──▶ mesh color
click ▶ raycast ▶ expressID ▶ piece mark ▶ matched element ▶ info panel
```

## Bundle / performance

- Viewer component + `web-ifc` + `three` live in a chunk imported only by the
  lazy 3D tab. `npm run build` must show the main/vendor chunks unchanged; the
  3D chunk is separate. (This is the acceptance gate for "doesn't regress load".)
- MVP loads whole-model geometry (fine for typical job/sequence models). Very
  large models → adopt `@thatopen` fragments later behind the same tab.

## Out of scope (later slices)

Erection-sequence playback, spatial RFI pins, model↔sheet deep-linking,
multi-model compare, sectioning/measure, `element_guid` backfill, IFC property
extraction into `model_elements`.

## Testing & validation

- **Unit:** the piece-mark extraction + status-color mapping helper (candidate-
  property precedence, unmatched handling) — pure, no wasm.
- **Build:** main bundle size unchanged; 3D code in its own chunk; lint/tsc/
  typecheck:js/test/build green.
- **Manual (needs the sample IFC):** upload → model renders → pieces colored by
  status → click a known piece shows correct mark/status/links → confirm the
  wasm loads only on tab open (network tab).
- Flag `viewer_3d` stays off in prod until the manual pass on a real Tekla file.

## Risks

- **wasm/JS version drift** → silent zero-geometry. Mitigation: the copy-from-
  installed-package step (unit-of-work #1).
- **Tekla property mapping** — which property holds the mark varies by export
  settings. Mitigation: candidate-property precedence + the real-file pass; the
  mark→status helper is isolated + unit-tested so a mapping tweak is one place.
- **Large IFC memory** — whole-model load. Mitigation: MVP targets normal job
  models; fragments path noted for later.

## Reversibility

New code behind a feature flag + lazy chunk; the upload modal + `model_registry`
rows are additive. Removing = flag off + delete the viewer chunk; no change to
existing pages beyond one `TABS` entry.
