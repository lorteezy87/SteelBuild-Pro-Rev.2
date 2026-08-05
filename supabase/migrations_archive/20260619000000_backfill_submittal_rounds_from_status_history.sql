-- ============================================================
-- 20260619000000: Backfill submittal_rounds from status history
-- ------------------------------------------------------------
-- Reviewer verdicts were being recorded as a submittal STATUS flip
-- (status + submitted/returned/approved dates + reviewer) via the inline
-- status path, which never logged a `submittal_rounds` row — so the round
-- history timeline, resubmittal "Round N+1" anchoring, and per-round cycle
-- samples all sat empty despite daily use (0 round rows across all projects).
--
-- The forward fix routes a verdict status-change through the audited round
-- path (see src/pages/Submittals.tsx onStatusChange). This migration
-- backfills the EXISTING decided submittals so the timeline + cycle history
-- reflect reality immediately.
--
-- Synthesizes ONE round (round_number 1) per decided submittal that has a
-- submitted_date and a return/approval date — the single submit→return cycle
-- the data can support. Submittals without a submitted_date are skipped (no
-- cycle start to synthesize). Per-sheet responses are NOT backfilled (that
-- data was never captured). Tagged metadata.source for reversibility:
--   DELETE FROM submittal_rounds
--   WHERE metadata->>'source' = 'backfill-status-history-2026-06-19';
--
-- Idempotent: the NOT EXISTS guard makes re-runs a no-op. Applied live via
-- Supabase MCP on 2026-06-19 (15 rounds across the live projects).
-- ============================================================

WITH inserted AS (
  INSERT INTO submittal_rounds
    (project_id, submittal_id, round_number, submitted_date, returned_date,
     status, ball_in_court, reviewer, drawing_set_ids, metadata)
  SELECT
    s.project_id, s.id, 1,
    s.submitted_date,
    COALESCE(s.returned_date, s.approved_date),
    s.status, s.ball_in_court, s.reviewer,
    COALESCE(s.drawing_set_ids, '{}'::uuid[]),
    jsonb_build_object('source', 'backfill-status-history-2026-06-19')
  FROM submittals s
  WHERE s.is_deleted = false
    AND s.status IN ('Approved', 'Approved as Noted', 'Revise and Resubmit',
                     'Rejected', 'Released for Fabrication')
    AND s.submitted_date IS NOT NULL
    AND COALESCE(s.returned_date, s.approved_date) IS NOT NULL
    AND COALESCE(s.returned_date, s.approved_date) >= s.submitted_date
    AND NOT EXISTS (SELECT 1 FROM submittal_rounds r WHERE r.submittal_id = s.id)
  RETURNING id, submittal_id
)
UPDATE submittals s
SET current_round_id = i.id
FROM inserted i
WHERE s.id = i.submittal_id;
