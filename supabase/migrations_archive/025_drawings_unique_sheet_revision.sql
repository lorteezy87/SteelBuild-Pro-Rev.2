-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 025 — Enforce uniqueness of (project_id, sheet_number, revision_number)    │
-- │                                                                              │
-- │ Prevents two active (non-deleted) rows from claiming the same sheet number │
-- │ at the same revision inside a single project. Superseded revisions are     │
-- │ fine because they keep their own revision_number distinct.                 │
-- │                                                                              │
-- │ Partial unique index: only active rows (is_deleted = false) and only rows  │
-- │ with a real sheet_number (blanks stay legal for legacy/draft data).        │
-- ╰────────────────────────────────────────────────────────────────────────────╯

CREATE UNIQUE INDEX IF NOT EXISTS uq_drawings_project_sheet_revision
  ON drawings (project_id, sheet_number, revision_number)
  WHERE is_deleted = FALSE
    AND sheet_number IS NOT NULL
    AND sheet_number <> '';
