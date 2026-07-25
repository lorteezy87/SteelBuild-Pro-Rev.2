# Piece ↔ Work Package ↔ Fab ↔ 3D Glue Design

**Date:** 2026-07-25  
**Status:** Draft for owner review (brainstorming §§1–4 approved in chat)  
**Branch:** `cursor/piece-wp-3d-glue-design-3d17`

## Problem

Piece marks are hard to attach to work packages, fabrication progress does not
drive the Work Packages list, and the 3D model does not reliably update when
pieces move through fab. Existing Piece Control already has most of the
primitives (`pieces.work_package_id`, lifecycle RPCs, viewer coloring via
`model_elements.piece_id`), but the glue between them is incomplete.

## Decision summary (approved)

| Topic | Choice |
|---|---|
| Scope | All three: assign + fab track + 3D auto-update |
| Approach | **Thin glue first** (Approach 1); Package Board UI later |
| Assign UX | **A + B now** (WP bulk + Piece Register multi-select); 3D click / auto-rules later |
| WP progress | **Write-through** `%` + status onto `work_packages` |
| 3D link | **Lot-aware exact mark match** (skip ambiguous) |

## Goals (v1)

1. **Assign** — clear WP → pieces bulk attach and Piece Register multi-select assign; assignment sticks and syncs the 3D roster WP link.
2. **Fab → WP** — leaf-piece lifecycle/stations write through to `work_packages.percent_complete` + mapped `status`.
3. **3D auto-update** — lot-aware mark match sets `model_elements.piece_id`; lifecycle mirrors to `fab_status` so the viewer recolors without hand edits.

## Non-goals (v1)

- New Package Board surface (drag marks, fab swimlanes, embedded 3D).
- Auto-assign-by-rule engine (sequence / erection area / drawing set).
- Retiring `piece_production` in this pass (shipping list bridge stays).
- Changing Gantt task logic beyond reading updated WP fields.

## Source of truth

| Concern | Authority |
|---|---|
| Piece identity, lifecycle, station progress, WP membership | Canonical **`pieces`** (actionable **leaves** only — exclude containers / split parents via `selectActionableLeafPieces`) |
| Work package list `%` / coarse status | **Projection** written from leaf pieces when Piece Control mode is `pilot` / `live` and the WP has ≥1 assigned leaf |
| IFC geometry identity | `model_elements.element_guid` |
| IFC fab color when linked | Piece lifecycle (+ hold) via `piece_id` |
| IFC fab color when unlinked | Legacy `model_elements.fab_status` / mark maps |

```text
pieces (SoT)
   │ assign / unassign
   │ stations / logistics
   ├──────────────► work_packages.percent_complete + status
   │
   └─ link + mirror ► model_elements.piece_id
                      model_elements.fab_status
                      model_elements.work_package_id
                              │
                              ▼
                         IfcModelViewer paint
```

---

## Slice 1 — Assign UX + roster WP sync

### Keep

- RPCs: `assign_pieces_to_work_package`, `unassign_pieces_from_work_package`
  (`supabase/migrations/20260718020000_piece_control_slice2.sql`)
- Leaf-only, mode ≠ `off`, role ≥ `field`
- UI shell: `PieceRelationshipManager` (embedded in Piece Register + WP detail)

### Extend RPC (or post-step in same transaction)

After assign/unassign succeeds for piece IDs:

1. For each affected piece with `piece_id` links already on `model_elements`, set
   `model_elements.work_package_id` to the piece’s current WP (or `NULL` on unassign).
2. Return `{ assigned|unassigned, unchanged, model_elements_synced }`.

(Full mark→`piece_id` linking is Slice 3; Slice 1 only syncs rows that already
have `piece_id`.)

### UX A — Work Package detail

- First-class **Pieces** panel (not buried under generic Piece Control chrome):
  - Filters: unassigned / this WP / mark search
  - Multi-select + **Add to this WP** / **Remove from WP**
  - Selection count + tonnage
  - Empty state: “No pieces assigned — add from unassigned marks”
  - Inline readiness blockers (existing `evaluateWorkPackageReadiness`)
- Bulk-add from another WP: confirm reassign before applying

### UX B — Piece Register

- Sticky action bar when N > 0 selected: **Assign to…** (WP picker) + **Unassign**
- Toast with RPC counts; invalidate register, WP list, relationships, 3D queries

### Rules

- Only actionable leaf pieces
- Reassign A→B allowed (event logged)
- No auto-assign-by-rule

---

## Slice 2 — Fab write-through to Work Packages

### Rollup inputs

Reuse client math already in `src/lib/pieceControl/canonicalRollups.ts`:

- `selectActionableLeafPieces`
- `tonnageWeightedFabricationPercent` (station earned %)
- `deriveWorkPackageStatus` (rich label for Piece Control UI)

Port the persistence mapping into a SECURITY DEFINER helper, e.g.
`refresh_work_package_progress(p_work_package_id uuid)`, callable from piece
RPCs. Prefer **one SQL implementation** shared by all writers (not only
client-side patches).

### Persisted fields

| Column | Rule |
|---|---|
| `percent_complete` | Tonnage-weighted earned % (0–100). If all weights unknown → lot-count-weighted earned %. If no leaves → `0`. If no station config yet → `0` (or keep prior only when explicitly documented — default `0` for empty progress). |
| `status` | Mapped coarse enum below |
| Hold | If **all** assigned leaves `on_hold` → `On Hold` |

### Status map → `work_packages.status`

Existing enum: `Not Started` \| `In Progress` \| `Complete` \| `On Hold`.

| Derived (internal, dashboard) | Persisted |
|---|---|
| No Canonical Scope | `Not Started` |
| Ready for Release / Released | `Not Started` |
| In Fabrication / Fabrication Complete / Shipping / Delivered / Erection | `In Progress` |
| Complete (all erected) | `Complete` |
| All assigned leaves on hold | `On Hold` |

Rich derived labels remain on Piece Control dashboard only.

### When refresh runs

Call `refresh_work_package_progress` after:

- assign / unassign
- `release_work_package_canonical`
- `advance_piece_station`
- `ship_piece_lots` / `deliver_piece_lots` / `erect_piece_lots`
- hold / release-hold on pieces that belong to a WP

Refresh the **previous** and **new** WP when reassigning.

### Manual WP % edits

When `projects.piece_control_mode ∈ {pilot, live}` **and** the WP has ≥1
assigned leaf: disable or ignore manual `%` / status edits in WP form (toast:
“Progress is driven by piece fabrication”). Mode `off` / no leaves → manual
edit unchanged.

---

## Slice 3 — Lot-aware IFC ↔ piece link + lifecycle mirror

### Link RPC

e.g. `link_model_elements_to_pieces(p_project_id uuid)` → jsonb counts.

For each active `model_elements` row with a usable mark:

1. Normalize mark identically to `pieces.normalized_piece_mark`.
2. Candidates = actionable leaf pieces in the project.
3. If element carries `lot_code` (column or metadata) → unique match on
   `(normalized_piece_mark, lot_code)`.
4. Else if exactly **one** leaf exists for that mark → match.
5. Else (0 or many) → skip; accumulate `unmatched` / `ambiguous`.

Never guess among multiple lots.

### When linking runs

- After IFC roster import/save (`importIfcRoster` / Model 3D save path)
- Explicit **Link marks to pieces** action (Model 3D + Piece Register)
- After canonical piece import that adds/changes marks or lots (re-link
  affected marks)

### Mirror

When `piece_id` is set/changed, or linked piece lifecycle / WP / hold changes:

| `model_elements` column | Source |
|---|---|
| `fab_status` | `pieces.lifecycle_status` |
| `work_package_id` | `pieces.work_package_id` |

Prefer trigger on `pieces` update (for already-linked rows) + set-on-link inside
the link RPC. Viewer continues to prefer canonical paint via
`buildCanonicalPieceByGuid` when `piece_id` is present.

### Viewer / write policy

- Linked pieces: 3D “Set fab status” remains redirected to Piece Control
- Unlinked: legacy fab/mark coloring unchanged
- Toast/panel after link: `linked N · unmatched M · ambiguous K` + exportable
  ambiguous mark list

---

## Later upgrade — Package Board

Built **on top of** this glue (not a rewrite):

- WP columns / fab swimlanes
- Drag piece marks between packages (calls same assign RPCs)
- Embedded 3D with select-elements → assign WP
- Optional auto-assign rules (deferred “D”)

---

## Auth / mode / RLS

- All new RPCs: `SECURITY DEFINER`, explicit `search_path`, role floor ≥ `field`
  (mode changes remain admin/owner via existing `set_piece_control_mode`)
- No-op or clear error when `piece_control_mode = 'off'`
- Wrap `auth.uid()` in `(select …)` in any new policies
- Do not introduce blanket-true RLS

## Testing

| Slice | Must cover |
|---|---|
| 1 | Assign/unassign leaf OK; container rejected; `model_elements.work_package_id` sync when `piece_id` set; WP + Register UI actions |
| 2 | Station advance updates WP `%`; all erected → `Complete`; all hold → `On Hold`; reassign refreshes both WPs; manual edit blocked in pilot/live with leaves |
| 3 | Exact single-mark link; lot-aware link; ambiguous skipped; lifecycle mirror paints 3D; import triggers link |

Prefer Vitest for pure rollup/mapping; SQL/RPC tests or local supabase for
SECURITY DEFINER paths; keep Playwright piece-control pilot green.

## Rollout

1. Ship migrations + UI behind existing `piece_control_mode` (no new flag).
2. Shadow/pilot projects: run **Link marks** once after deploy; verify 3D colors.
3. Confirm WP list `%` moves after a station advance on a pilot WP.
4. Package Board is a separate design/plan after glue is field-verified.

## Open points (resolved in chat)

- None blocking v1. Ambiguous multi-lot marks without lot on the IFC row require
  human resolve in Piece Register, then re-link.

## References

- `src/lib/pieceControl/canonicalRollups.ts`
- `src/lib/pieceControl/relationshipsRepository.ts`
- `src/components/pieceControl/PieceRelationshipManager.tsx`
- `src/components/viewer3d/Model3DTab.jsx`
- `src/lib/ifc/viewerColoring.js` (`buildCanonicalPieceByGuid`)
- `src/services/ifcRosterImport.js`
- `docs/runbooks/piece-control-pilot.md`
- Migrations `20260718000000` … `slice7`, `20260724130000_piece_control_production_hardening.sql`
