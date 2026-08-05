-- Drawing Hub V3.2 — Native 'finding' link type.
--
-- Context: V3.0 acceptZoneProposal linked drawing_findings to zones by
-- using linked_record_type='document' with metadata.kind='finding' and
-- metadata.finding_id=<uuid> because the drawing_links CHECK constraint
-- didn't include a 'finding' enum value.  This migration closes that gap:
--
--   1. Replaces validate_drawing_link_target() to map 'finding' →
--      drawing_findings (project_id resolved via drawing_analyses join).
--   2. Extends drawing_links_record_type_allowed CHECK to include 'finding'.
--   3. Backfills existing document-kind-finding rows to the new type,
--      swapping the workaround linked_record_id (drawing_id) for the real
--      finding uuid stored in metadata.finding_id.

-- ── 1. Polymorphic FK validator ───────────────────────────────────────
-- Full replacement so 'finding' is handled alongside the existing types.
-- The trigger is BEFORE INSERT (FK enforcement); we leave the trigger
-- binding itself unchanged — only the function body is replaced here.
CREATE OR REPLACE FUNCTION validate_drawing_link_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  found_count int;
BEGIN
  CASE NEW.linked_record_type
    WHEN 'rfi' THEN
      SELECT COUNT(*) INTO found_count FROM rfis
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'work_package' THEN
      SELECT COUNT(*) INTO found_count FROM work_packages
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'delivery' THEN
      SELECT COUNT(*) INTO found_count FROM deliveries
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'photo' THEN
      SELECT COUNT(*) INTO found_count FROM documents
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'inspection' THEN
      SELECT COUNT(*) INTO found_count FROM inspections
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'daily_log' THEN
      SELECT COUNT(*) INTO found_count FROM daily_logs
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'document' THEN
      SELECT COUNT(*) INTO found_count FROM documents
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'change_order' THEN
      SELECT COUNT(*) INTO found_count FROM change_orders
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'submittal' THEN
      SELECT COUNT(*) INTO found_count FROM documents
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'drawing' THEN
      SELECT COUNT(*) INTO found_count FROM drawings
        WHERE id = NEW.linked_record_id AND project_id = NEW.project_id;
    WHEN 'finding' THEN
      -- drawing_findings has no project_id column; resolve via analysis.
      SELECT COUNT(*) INTO found_count
        FROM drawing_findings df
        JOIN drawing_analyses da ON da.id = df.analysis_id
        WHERE df.id = NEW.linked_record_id
          AND da.project_id = NEW.project_id;
    ELSE
      RAISE EXCEPTION 'validate_drawing_link_target: unknown linked_record_type %',
        NEW.linked_record_type;
  END CASE;

  IF found_count = 0 THEN
    RAISE EXCEPTION '% % not found in project %',
      NEW.linked_record_type, NEW.linked_record_id, NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2. Extend the CHECK constraint ───────────────────────────────────
ALTER TABLE drawing_links
  DROP CONSTRAINT IF EXISTS drawing_links_record_type_allowed;

ALTER TABLE drawing_links
  ADD CONSTRAINT drawing_links_record_type_allowed
  CHECK (linked_record_type IN (
    'rfi', 'work_package', 'delivery', 'photo', 'inspection',
    'daily_log', 'document', 'change_order', 'submittal', 'drawing',
    'finding'
  ));

-- ── 3. Backfill ───────────────────────────────────────────────────────
-- Only update rows where the real finding still exists in drawing_findings
-- (joined via drawing_analyses to confirm project scope). Orphaned rows
-- — findings deleted since the link was created — are left as-is
-- (linked_record_type stays 'document') so the backfill is non-destructive.
UPDATE drawing_links dl
SET
  linked_record_type = 'finding',
  linked_record_id   = (dl.metadata->>'finding_id')::uuid
FROM drawing_findings df
JOIN drawing_analyses da ON da.id = df.analysis_id
WHERE dl.linked_record_type = 'document'
  AND dl.removed_at IS NULL
  AND (dl.metadata->>'kind')       = 'finding'
  AND (dl.metadata->>'finding_id') IS NOT NULL
  AND df.id         = (dl.metadata->>'finding_id')::uuid
  AND da.project_id = dl.project_id;
