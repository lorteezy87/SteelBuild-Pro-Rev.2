-- Migration 056: Add 'Incomplete Response' to the RFI status CHECK constraint.
--
-- Workflow context: 'Incomplete Response' = the GC sent an answer back, but the
-- response doesn't fully address the question and the RFI needs another round.
-- It sits between 'Under Review' and 'Answered' in the lifecycle — the RFI is
-- technically responded-to but still requires action. Treated as still-open
-- (NOT included in ['Answered','Closed'] closed-state filters).

ALTER TABLE rfis DROP CONSTRAINT IF EXISTS chk_rfis_status;
ALTER TABLE rfis ADD CONSTRAINT chk_rfis_status
  CHECK (status IN ('Open', 'Under Review', 'Incomplete Response', 'Answered', 'Closed', 'Void'));
