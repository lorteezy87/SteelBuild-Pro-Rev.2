-- Restore sync_drawing_set_counts() body — was stubbed out at some point
-- (likely a botched search_path security advisor fix that templated the
-- function with a placeholder body) and started silently rejecting EVERY
-- drawings INSERT/UPDATE with PG error:
--   "control reached end of trigger procedure without RETURN"
--
-- The trigger is AFTER INSERT/UPDATE/DELETE on drawings, so when it
-- raised the user's per-sheet drawings inserts all aborted while the
-- parent drawing_sets row succeeded — leading to "set uploaded but no
-- sheets show up." Postgres logs at the time of the failed uploads
-- match this shape exactly.
--
-- This migration recreates the function with the original body from
-- migration 020 AND preserves the SET search_path security setting that
-- the advisor was trying to land in the first place.

CREATE OR REPLACE FUNCTION public.sync_drawing_set_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_set UUID;
BEGIN
  -- Decide which parent set(s) need a refresh.
  IF TG_OP = 'DELETE' THEN
    v_set := OLD.drawing_set_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.drawing_set_id IS DISTINCT FROM OLD.drawing_set_id THEN
    -- Moved between sets: refresh BOTH the source and destination set.
    IF OLD.drawing_set_id IS NOT NULL THEN
      UPDATE drawing_sets ds SET
        sheet_count         = COALESCE((SELECT COUNT(*)                                             FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        processed_count     = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Processed')                              FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        needs_review_count  = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'NeedsReview')                            FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        failed_count        = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Failed' OR upload_status = 'Failed')     FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        updated_at          = NOW()
      WHERE ds.id = OLD.drawing_set_id;
    END IF;
    v_set := NEW.drawing_set_id;
  ELSE
    v_set := NEW.drawing_set_id;
  END IF;

  IF v_set IS NOT NULL THEN
    UPDATE drawing_sets ds SET
      sheet_count         = COALESCE((SELECT COUNT(*)                                             FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      processed_count     = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Processed')                              FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      needs_review_count  = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'NeedsReview')                            FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      failed_count        = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Failed' OR upload_status = 'Failed')     FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      updated_at          = NOW()
    WHERE ds.id = v_set;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

NOTIFY pgrst, 'reload schema';
