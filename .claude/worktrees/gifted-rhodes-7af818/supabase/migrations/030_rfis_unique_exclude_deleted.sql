-- Migration 030: Fix unique constraint on rfis to exclude soft-deleted rows.
--
-- The original constraint uq_rfis_project_number covers ALL rows including
-- soft-deleted ones (is_deleted = true). This means bulk-importing RFIs into a
-- project that previously had RFIs deleted will fail with a duplicate key error
-- because the numbering logic only sees active rows but the constraint includes
-- deleted ones. Same pattern as migration 029 for drawing_sets.
--
-- Also adds "Void" to the status check constraint since the UI supports voiding.

-- 1. Drop the old full unique constraint
ALTER TABLE rfis DROP CONSTRAINT IF EXISTS uq_rfis_project_number;

-- 2. Recreate as partial unique index excluding soft-deleted rows
CREATE UNIQUE INDEX uq_rfis_project_number
  ON rfis (project_id, rfi_number)
  WHERE rfi_number IS NOT NULL AND rfi_number <> '' AND is_deleted = false;

-- 3. Add "Void" to the status check constraint
ALTER TABLE rfis DROP CONSTRAINT IF EXISTS chk_rfis_status;
ALTER TABLE rfis ADD CONSTRAINT chk_rfis_status
  CHECK (status IN ('Open', 'Under Review', 'Answered', 'Closed', 'Void'));
