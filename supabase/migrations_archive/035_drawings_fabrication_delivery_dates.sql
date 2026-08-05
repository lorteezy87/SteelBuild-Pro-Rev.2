-- ============================================================================
-- 035_drawings_fabrication_delivery_dates.sql
--
-- Adds four lifecycle dates to the `drawings` table so each sheet can carry
-- its own fabrication / delivery timeline alongside the existing
-- submitted_date / return_date / due_date triad.
--
-- New columns:
--   - fabrication_start_date   DATE  — fab shop cut date
--   - fabrication_finish_date  DATE  — fab shop QA/coat complete
--   - ready_for_install_date   DATE  — material released to field / yard
--   - final_delivery_date      DATE  — actual final on-site delivery
--
-- All four are optional (NULL) so existing rows are unaffected. The values
-- are maintained manually in the SheetFormModal today; a future migration
-- may cross-reference deliveries.actual_date once a drawing_id FK exists
-- on deliveries.
-- ============================================================================

ALTER TABLE drawings ADD COLUMN IF NOT EXISTS fabrication_start_date  DATE;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS fabrication_finish_date DATE;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS ready_for_install_date  DATE;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS final_delivery_date     DATE;

-- Nudge PostgREST to refresh its schema cache so the new columns become
-- visible to API clients immediately rather than after the periodic reload.
NOTIFY pgrst, 'reload schema';
