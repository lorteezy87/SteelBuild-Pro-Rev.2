-- Migration: 20260517001000_rfi_entity_hardening
-- Purpose: Add proper FK links from RFIs to work_packages and drawing_sets,
--          replacing the existing TEXT work_package_id with a UUID FK,
--          and adding drawing_set_id + area_sequence for operational mapping.

-- Step 1: Convert work_package_id from TEXT to UUID
-- First, drop any data that isn't a valid UUID (best-effort)
UPDATE rfis
SET work_package_id = NULL
WHERE work_package_id IS NOT NULL
  AND work_package_id != ''
  AND work_package_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- Clear empty strings so the cast doesn't fail
UPDATE rfis SET work_package_id = NULL WHERE work_package_id = '';

-- Alter the column type from TEXT to UUID
ALTER TABLE rfis ALTER COLUMN work_package_id TYPE uuid USING work_package_id::uuid;

-- Add FK constraint (idempotent via IF NOT EXISTS name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rfis_work_package_id_fkey'
  ) THEN
    ALTER TABLE rfis
      ADD CONSTRAINT rfis_work_package_id_fkey
      FOREIGN KEY (work_package_id) REFERENCES work_packages(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Step 2: Add drawing_set_id UUID FK
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS drawing_set_id UUID REFERENCES drawing_sets(id) ON DELETE SET NULL;

-- Step 3: Add area_sequence for operational mapping
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS area_sequence TEXT;

-- Step 4: Indexes for the new FK columns
CREATE INDEX IF NOT EXISTS idx_rfis_work_package_id ON rfis(work_package_id) WHERE work_package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rfis_drawing_set_id ON rfis(drawing_set_id) WHERE drawing_set_id IS NOT NULL;
