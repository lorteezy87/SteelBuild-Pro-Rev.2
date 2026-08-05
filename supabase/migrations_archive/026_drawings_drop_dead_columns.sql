-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 026 — Drop dead columns on drawings / drawing_sets                          │
-- │                                                                              │
-- │ F17 cleanup. The forensic audit flagged 6 columns as "dead weight" on the  │
-- │ drawings table. After grepping every JS/JSX/TS consumer in src/, the tally │
-- │ came back like this:                                                        │
-- │                                                                              │
-- │   drawings.drawing_page        0 readers  → already dropped in 024         │
-- │   drawings.returned_date       0 readers  → dropped here                   │
-- │   drawings.approval_status     0 readers  → dropped here (legacy, per-row  │
-- │                                              approval lived on the child,   │
-- │                                              now replaced by               │
-- │                                              drawing_sets.set_approval_*)  │
-- │   drawings.override_reason     1 reader   → kept, DrawingFormModal form    │
-- │   drawings.ifc_status          3 readers  → kept, BulkActionBar/SheetList  │
-- │   drawings.drawing_set_name    16 readers → kept, broadly used as fallback │
-- │                                                                              │
-- │ Also on drawing_sets:                                                       │
-- │   drawing_sets.approval_status had one write from RevisionUploadModal,     │
-- │   which we just migrated over to set_approval_status. Drop the dead col.   │
-- │                                                                              │
-- │ The still-read columns are left in place with their DEPRECATED comment     │
-- │ from migration 023 so a future sweep can finish the job once their         │
-- │ consumers migrate. Dropping them today would break the DrawingFormModal    │
-- │ override flow, BulkActionBar IFC button, and every list view that falls    │
-- │ back to drawing_set_name when the FK is missing on legacy rows.            │
-- ╰────────────────────────────────────────────────────────────────────────────╯

-- 1. drawings.returned_date — zero JS consumers, safe to drop.
ALTER TABLE drawings DROP COLUMN IF EXISTS returned_date;

-- 2. drawings.approval_status — zero JS consumers (all readers use
--    set_approval_status on the child or parent). Safe to drop.
ALTER TABLE drawings DROP COLUMN IF EXISTS approval_status;

-- 3. drawing_sets.approval_status — the one write from RevisionUploadModal
--    was migrated to drawing_sets.set_approval_status in the same commit
--    as this migration, so nothing still writes this column.
ALTER TABLE drawing_sets DROP COLUMN IF EXISTS approval_status;
