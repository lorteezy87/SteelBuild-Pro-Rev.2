-- 084_email_organization_columns.sql
-- Adds read/starred/label organization columns to email_messages
-- for the upgraded Email Inbox split-pane UI.

ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '[]'::jsonb;

-- Partial indexes for common sidebar filters
CREATE INDEX IF NOT EXISTS email_messages_starred_idx
  ON email_messages(project_id, is_starred)
  WHERE is_starred = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS email_messages_read_idx
  ON email_messages(project_id, is_read)
  WHERE is_read = false AND is_deleted = false;
