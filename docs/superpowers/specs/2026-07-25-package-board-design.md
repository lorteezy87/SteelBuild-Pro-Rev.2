# Package Board Design

**Date:** 2026-07-25  
**Status:** Approved — implementing on `cursor/package-board-design-3d17`  
**Depends on:** Piece↔WP↔fab↔3D glue (`20260725210000_piece_wp_fab_3d_glue.sql`, PR #129)

## Problem

Assigning piece marks to work packages via list checkboxes is slow. Operators need
a visual board: drag marks onto packages, see unassigned scope, and later layer
fab swimlanes and 3D select→assign on the same surface.

## Decision summary (approved)

| Topic | Choice |
|---|---|
| Approach | Lightweight board on existing glue (Approach 1) |
| Primary layout | WP columns first; Lifecycle + 3D as later modes |
| Placement | Piece Register view now; promote to top-level nav later |
| Unassigned | Dedicated **Unassigned** column on the left |
| Drag | `@hello-pangea/dnd` → existing assign/unassign RPCs |

## Goals (v1 — Packages mode)

1. New Piece Register view **Board**.
2. Columns: **Unassigned** + one column per active work package.
3. Cards = actionable leaf pieces (mark, lot, lifecycle pill, tons if known).
4. Drag Unassigned→WP assigns; WP→Unassigned unassigns; WP→WP reassigns (confirm).
5. Mode tabs: **Packages** (live) · Lifecycle · 3D (stubs).
6. Mark search + optional lifecycle filter.

## Non-goals (v1)

- Lifecycle swimlanes and 3D split implementation
- New DB tables, WIP limits, multi-card drag, inline card editing
- Auto-assign-by-rule engine
- Top-level nav item

## Source of truth

Unchanged: canonical `pieces` + glue RPCs
(`assign_pieces_to_work_package` / `unassign_pieces_from_work_package`).
Board is a presentation + interaction layer only.

---

## Placement

Add to `REGISTER_VIEWS` in `src/pages/PieceRegister.tsx`:

```ts
{ id: "board", label: "Board", icon: /* LayoutGrid or similar */ }
```

When `activeView === "board"`, render `<PackageBoard projectId pieceControlMode={mode} />`.

Mode `off`: show enable-Piece-Control empty state; no drag.

---

## UI structure

```
[ Packages | Lifecycle (soon) | 3D (soon) ]   [ mark search ] [ lifecycle filter ]
┌──────────┬──────────┬──────────┬────┐
│Unassigned│ WP-001   │ WP-002   │ …  │
│ cards…   │ cards…   │ cards…   │    │
└──────────┴──────────┴──────────┴────┘
```

### Components

| Module | Role |
|---|---|
| `src/components/pieceControl/PackageBoard.tsx` | Shell: mode tabs, filters, DnD context, columns |
| `src/components/pieceControl/PackageBoardColumn.tsx` | Droppable column + header (count, tons) |
| `src/components/pieceControl/PackageBoardCard.tsx` | Draggable leaf card |
| `src/components/pieceControl/packageBoard.derive.ts` | Pure group/filter/sort/totals |

### Card fields

- `piece_mark` (primary)
- Lot code
- Lifecycle pill (existing labels/colors)
- Tons when weight known; omit when unknown

### Column header

- Title: “Unassigned” or `wp_number` / name
- Leaf count
- Known tons total

---

## Interactions

| Action | Behavior |
|---|---|
| Drop Unassigned → WP | `assignPiecesToWorkPackage(projectId, [pieceId], wpId)` |
| Drop WP → Unassigned | `unassignPiecesFromWorkPackage(projectId, [pieceId])` |
| Drop WP-A → WP-B | `window.confirm` then assign to B |
| Drop same column | no-op |
| Multi-select drag | **out of scope** for v1 (single card) |
| Click card | out of scope for v1 |

On success: toast + invalidate `piece-register`, `piece-relationships`,
`work-packages` / `workPackages`, `model-elements`, `canonical-pieces-3d`.

Optimistic UI: move card in local column state; rollback on error.

---

## Data / derive

```ts
type BoardColumnId = "unassigned" | string; // wp id

interface BoardColumn {
  id: BoardColumnId;
  title: string;
  pieces: LeafPiece[];
  leafCount: number;
  knownTons: number;
}
```

Rules:

- Leaves only (`selectActionableLeafPieces`)
- Unassigned = `work_package_id == null`
- One column per non-deleted WP (stable sort by `wp_number` / name)
- Filter by mark substring + optional lifecycle equality
- Sort cards within column by natural mark order

---

## Mode stubs (v1)

| Tab | Behavior |
|---|---|
| Packages | Full board |
| Lifecycle | Disabled + short “Coming next” copy |
| 3D | Disabled + short “Coming next” copy |

Same shell component; later modes replace the column body only.

---

## Styling

- Command / piece-control tokens (`piece-control-command.css`, `.cmd-*`)
- CSS variables only; border-radius 2px
- Horizontal scroll for many WPs; columns fixed min-width

---

## Testing

| Layer | Cases |
|---|---|
| `packageBoard.derive` | Unassigned + WP grouping; leaf-only; filters; tons |
| `PackageBoard` (jsdom) | Drop Unassigned→WP calls assign; WP→WP confirm; mode off blocks drag |
| Manual | Drag 2 marks onto WP; Relationships + WP % + linked 3D stay consistent |

---

## Rollout

1. Merge UI behind existing Piece Register; no new feature flag.
2. Require glue migration present on the environment.
3. Field-verify on a `pilot`/`live` project.
4. Follow-ons: Lifecycle mode → 3D split → optional top-level nav.

## References

- Spec: `docs/superpowers/specs/2026-07-25-piece-wp-fab-3d-glue-design.md`
- RPCs: `src/lib/pieceControl/relationshipsRepository.ts`
- DnD: `@hello-pangea/dnd`
- Register shell: `src/pages/PieceRegister.tsx`
