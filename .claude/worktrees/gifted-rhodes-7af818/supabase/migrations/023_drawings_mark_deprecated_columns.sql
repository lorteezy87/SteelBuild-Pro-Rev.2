-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 023 — Mark legacy drawings columns as deprecated                            │
-- │                                                                              │
-- │ The UI now groups sheets by the `drawing_set_id` FK (see migration 020      │
-- │ which introduced the parent/child relationship). The text column            │
-- │ `drawing_set_name` is kept for backward compatibility with older readers    │
-- │ and the import/validation path, but should not be the source of truth.     │
-- │                                                                              │
-- │ This migration only tags the column with a comment so DB browsers surface  │
-- │ the deprecation warning; the actual DROP is scheduled for the dead-column  │
-- │ cleanup migration (026, F17 in the audit) once all writers have migrated.  │
-- ╰────────────────────────────────────────────────────────────────────────────╯

COMMENT ON COLUMN drawings.drawing_set_name IS
  'DEPRECATED: Use drawing_set_id FK instead. Kept for backward compatibility with legacy readers and the import path. Will be dropped in migration 026.';

-- While we're here, also tag the handful of other columns the audit flagged
-- as dead weight so it's obvious where cleanup is headed.
COMMENT ON COLUMN drawings.drawing_page IS
  'DEPRECATED: Duplicate of pdf_page. Always NULL in practice. Dropped in migration 024.';

COMMENT ON COLUMN drawings.ifc_status IS
  'DEPRECATED: Superseded by stage = ''Released''. No writers remain. Drop candidate.';

COMMENT ON COLUMN drawings.approval_status IS
  'DEPRECATED: Superseded by set_approval_status. No writers remain. Drop candidate.';

COMMENT ON COLUMN drawings.returned_date IS
  'DEPRECATED: Superseded by return_date. No writers remain. Drop candidate.';

COMMENT ON COLUMN drawings.override_reason IS
  'DEPRECATED: Feature never shipped. No writers remain. Drop candidate.';
