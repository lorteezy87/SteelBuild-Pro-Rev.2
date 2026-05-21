-- 20260520002000_email_send_columns.sql
-- Adds columns to email_messages for outbound email support (compose/reply).
-- direction: 'inbound' (default, existing webhook-ingested) or 'outbound' (sent from app).
-- in_reply_to: Message-ID of the email being replied to (threading).
-- thread_id: groups related messages into a conversation thread.
-- sent_at: timestamp when the outbound message was actually sent.
-- sent_by: user_id of the person who sent the message.

ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound';
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS in_reply_to TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS thread_id TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES auth.users(id);

-- Constrain direction values
ALTER TABLE email_messages ADD CONSTRAINT email_messages_direction_check
  CHECK (direction IN ('inbound', 'outbound'));

-- Index for sent folder queries
CREATE INDEX IF NOT EXISTS email_messages_direction_idx
  ON email_messages(project_id, direction, sent_at DESC)
  WHERE is_deleted = false;

-- Index for thread grouping
CREATE INDEX IF NOT EXISTS email_messages_thread_idx
  ON email_messages(project_id, thread_id)
  WHERE thread_id IS NOT NULL AND is_deleted = false;

NOTIFY pgrst, 'reload schema';
