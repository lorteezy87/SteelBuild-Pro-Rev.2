# Package Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Piece Register **Board** view where operators drag leaf piece marks between Unassigned and work-package columns using existing assign/unassign RPCs.

**Architecture:** Pure `packageBoard.derive` builds columns from the relationship snapshot; `PackageBoard` owns filters, mode tabs, DnD, and mutations; card/column are presentational. No new tables — glue RPCs remain source of truth.

**Tech Stack:** React 18, TypeScript, TanStack Query, `@hello-pangea/dnd`, Vitest + Testing Library, command/piece-control CSS tokens.

## Global Constraints

- New code is `.ts` / `.tsx` only (`npm run check:no-new-js`).
- Leaves only via `selectActionableLeafPieces` (no container / split-parent double-count).
- CSS variables + command tokens; border-radius 2px on board chrome.
- Never use `<form>` tags or Radix Dialog.
- Invalidate `piece-register`, `piece-relationships`, `work-packages` / `workPackages`, `model-elements` / `modelElements`, `canonical-pieces-3d` after assign/unassign.
- Lifecycle + 3D modes are disabled stubs in v1.

---

## File map

| File | Responsibility |
|---|---|
| `src/components/pieceControl/packageBoard.derive.ts` | Group/filter/sort/tons |
| `src/components/pieceControl/__tests__/packageBoard.derive.test.ts` | Derive unit tests |
| `src/components/pieceControl/PackageBoardCard.tsx` | Draggable card |
| `src/components/pieceControl/PackageBoardColumn.tsx` | Droppable column |
| `src/components/pieceControl/PackageBoard.tsx` | Shell + DnD + mutations |
| `src/components/pieceControl/__tests__/PackageBoard.test.tsx` | Interaction tests |
| `src/pages/PieceRegister.tsx` | Register view `board` |
| `src/styles/piece-control-command.css` | Board layout styles |

---

### Task 1: Derive module (TDD)

**Files:**
- Create: `src/components/pieceControl/packageBoard.derive.ts`
- Create: `src/components/pieceControl/__tests__/packageBoard.derive.test.ts`

- [ ] Write failing tests: unassigned + WP columns; leaf-only; mark/lifecycle filters; known tons; natural mark sort
- [ ] Implement `buildPackageBoardColumns`
- [ ] Run `npx vitest run src/components/pieceControl/__tests__/packageBoard.derive.test.ts`
- [ ] Commit

### Task 2: Board UI + DnD

**Files:**
- Create: `PackageBoardCard.tsx`, `PackageBoardColumn.tsx`, `PackageBoard.tsx`
- Modify: `piece-control-command.css`

- [ ] Card: mark, lot, lifecycle pill, tons when known; `Draggable` when `dragEnabled`
- [ ] Column: header (title, count, tons), `Droppable` list
- [ ] Shell: Packages / Lifecycle / 3D tabs; mark + lifecycle filters; load snapshot; drag end → assign / unassign / confirm reassign; optimistic override map with rollback; mode `off` empty state
- [ ] Commit

### Task 3: Wire Piece Register

**Files:**
- Modify: `src/pages/PieceRegister.tsx`

- [ ] Add `{ id: "board", label: "Board", icon: LayoutGrid }` to `REGISTER_VIEWS`
- [ ] Render `<PackageBoard projectId pieceControlMode={mode} />` when `activeView === "board"`
- [ ] Commit

### Task 4: Component tests + verify

**Files:**
- Create: `src/components/pieceControl/__tests__/PackageBoard.test.tsx`

- [ ] Mode off blocks drag / shows setup copy
- [ ] Drop Unassigned→WP calls `assignPiecesToWorkPackage`
- [ ] WP→WP path uses confirm then assign
- [ ] `npm run lint`, targeted vitest, `npm run check:no-new-js`
- [ ] Push; update PR #131 from docs → feat
- [ ] Release claim row in `AGENT_CLAIMS.md` when done
