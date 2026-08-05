-- Migration: 20260517002000_work_package_array_linking
-- Purpose: Add proper UUID[] columns alongside existing TEXT comma-separated
--          linked_drawing_ids and linked_rfi_ids. Backfill from TEXT values.

-- Add new UUID[] columns
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS drawing_ids UUID[] DEFAULT '{}';
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS rfi_ids UUID[] DEFAULT '{}';

-- Backfill drawing_ids from linked_drawing_ids (TEXT, comma-separated)
UPDATE work_packages
SET drawing_ids = (
  SELECT COALESCE(array_agg(NULLIF(trim(elem), '')::uuid), '{}')
  FROM unnest(string_to_array(linked_drawing_ids, ',')) AS elem
  WHERE trim(elem) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)
WHERE linked_drawing_ids IS NOT NULL
  AND linked_drawing_ids != ''
  AND linked_drawing_ids ~ '[0-9a-fA-F]{8}-';

-- Backfill rfi_ids from linked_rfi_ids (TEXT, comma-separated)
UPDATE work_packages
SET rfi_ids = (
  SELECT COALESCE(array_agg(NULLIF(trim(elem), '')::uuid), '{}')
  FROM unnest(string_to_array(linked_rfi_ids, ',')) AS elem
  WHERE trim(elem) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)
WHERE linked_rfi_ids IS NOT NULL
  AND linked_rfi_ids != ''
  AND linked_rfi_ids ~ '[0-9a-fA-F]{8}-';

-- GIN indexes for array containment queries (@>, &&)
CREATE INDEX IF NOT EXISTS idx_work_packages_drawing_ids ON work_packages USING gin(drawing_ids) WHERE drawing_ids != '{}';
CREATE INDEX IF NOT EXISTS idx_work_packages_rfi_ids ON work_packages USING gin(rfi_ids) WHERE rfi_ids != '{}';
