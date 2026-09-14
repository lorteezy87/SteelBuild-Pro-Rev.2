# Piece ↔ WP ↔ Fab ↔ 3D Glue Implementation Plan

> **For agentic workers:** Implement task-by-task. Spec: `docs/superpowers/specs/2026-07-25-piece-wp-fab-3d-glue-design.md`.

**Goal:** Make piece↔WP assignment usable, write fab progress onto work packages, and auto-link/paint IFC from piece lifecycle.

**Architecture:** Canonical `pieces` remain SoT. Extend assign RPCs to sync roster WP; add `refresh_work_package_progress` called from piece writers; add lot-aware `link_model_elements_to_pieces` + lifecycle mirror onto `model_elements`.

**Tech Stack:** Supabase SQL RPCs, Vite/React Piece Control UI, Vitest.

## Global Constraints

- New code `.ts`/`.tsx` only under `src/`
- RLS: no blanket-true; `auth.uid()` in `(select …)`; SECURITY DEFINER sets `search_path`
- Leaf-only rollups via `selectActionableLeafPieces` semantics
- Package Board deferred

---

### Task 1: Migration — assign sync + refresh WP progress + link/mirror

**Files:**
- Create: `supabase/migrations/20260725210000_piece_wp_fab_3d_glue.sql`
- Test: SQL applied locally; Vitest for client helpers

**Produces:**
- `assign_pieces_to_work_package` / `unassign_pieces_from_work_package` also sync `model_elements.work_package_id` for linked rows; return `model_elements_synced`
- `refresh_work_package_progress(p_work_package_id uuid)` → updates `%` + status
- Triggers/calls from assign, release, station, logistics, hold
- `link_model_elements_to_pieces(p_project_id uuid)` → `{linked, unmatched, ambiguous}`
- Trigger: pieces lifecycle/WP/hold → mirror onto linked `model_elements`

- [ ] Write migration
- [ ] Apply locally
- [ ] Commit

### Task 2: Client repositories + pure helpers

**Files:**
- Modify: `src/lib/pieceControl/relationshipsRepository.ts`
- Create: `src/lib/pieceControl/modelElementLink.ts`
- Create: `src/lib/pieceControl/wpProgressMapping.ts`
- Tests: `src/lib/pieceControl/__tests__/wpProgressMapping.test.ts`, `modelElementLink.test.ts`

- [ ] Mapping helpers (derived → WP status; link match rules)
- [ ] RPC wrappers
- [ ] Tests
- [ ] Commit

### Task 3: Assign UX (WP + Register)

**Files:**
- Modify: `src/components/pieceControl/PieceRelationshipManager.tsx`
- Modify: `src/pages/PieceRegister.tsx` (sticky assign bar if needed)
- Modify: work package detail embed if needed
- Tests: `PieceRelationshipManager.test.tsx`

- [ ] WP-focused pieces panel filters + primary actions
- [ ] Register sticky assign/unassign
- [ ] Invalidate 3D queries on success
- [ ] Commit

### Task 4: Wire IFC import + Link action + WP form lock

**Files:**
- Modify: `src/services/ifcRosterImport.js` or TS wrapper callers in `Model3DTab.jsx`
- Modify: `Model3DTab.jsx` — Link marks button
- Modify: WP form modal — disable % when pilot/live + has leaves
- [ ] Commit

### Task 5: Verify

- [ ] Targeted vitest + lint + typecheck + check:no-new-js
- [ ] Push / update PR
