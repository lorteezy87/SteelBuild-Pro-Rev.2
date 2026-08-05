-- Align action_items.status check constraint with the UI.
-- UI uses: Open, In Progress, Complete, Cancelled
-- Legacy values kept for backwards compatibility: Resolved, Closed
ALTER TABLE action_items DROP CONSTRAINT IF EXISTS chk_action_items_status;
ALTER TABLE action_items ADD CONSTRAINT chk_action_items_status
  CHECK (status IN ('Open','In Progress','Complete','Cancelled','Resolved','Closed'));
