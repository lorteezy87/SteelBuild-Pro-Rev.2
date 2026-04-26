-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 059 — Loosen drawings uniqueness from per-project to per-set               │
-- │                                                                              │
-- │ Migration 025 added uq_drawings_project_sheet_revision: a unique index on  │
-- │ (project_id, sheet_number, revision_number) where the row is active and    │
-- │ has a real sheet number. That holds for typical structural-package drawings │
-- │ (S-101 R0 only exists once per project), but it BREAKS for shop drawings:  │
-- │ each shop set ("SHOP D: SES Gates", "SHOP E: SES Gates", …) is templated   │
-- │ from the same base and legitimately reuses the same sheet number across    │
-- │ sets. Today the SHOP E and SHOP F uploads both fail with                   │
-- │   "duplicate key value violates unique constraint                          │
-- │   uq_drawings_project_sheet_revision"                                      │
-- │ because their per-shop sheet "E1001 rev 2" collides with SHOP D's.         │
-- │                                                                              │
-- │ Fix: replace the index with one scoped by drawing_set_id. Inside a single  │
-- │ set, sheet numbers stay unique. Across sets in the same project, parallel  │
-- │ shops or alternate revisions can each have their own sheet "E1001 rev 2"   │
-- │ without colliding.                                                         │
-- │                                                                              │
-- │ NULLS DISTINCT (the default): legacy rows with drawing_set_id=NULL don't   │
-- │ enforce uniqueness against each other. That's intentional — those rows    │
-- │ predate the parent-child schema (migration 020) and are stable historical  │
-- │ data; we don't want a backfill to reject them. New uploads always populate │
-- │ drawing_set_id.                                                            │
-- ╰────────────────────────────────────────────────────────────────────────────╯

-- Drop the old project-scoped index. The CONCURRENTLY variant requires that
-- we are NOT inside a transaction, so we use the plain DROP — Supabase
-- migrations run in their own transaction and a brief lock here is fine.
DROP INDEX IF EXISTS uq_drawings_project_sheet_revision;

-- New set-scoped index. Same predicate (active, real sheet number),
-- adds drawing_set_id to the key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drawings_set_sheet_revision
  ON drawings (project_id, drawing_set_id, sheet_number, revision_number)
  WHERE is_deleted = FALSE
    AND sheet_number IS NOT NULL
    AND sheet_number <> '';

NOTIFY pgrst, 'reload schema';
