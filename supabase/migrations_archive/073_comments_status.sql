-- 073_comments_status.sql — Resolution status for comment threads
--
-- Adds a tri-state (plus null/legacy) `status` to public.comments so that
-- threaded comments on RFIs, submittals, schedule tasks, etc. can be
-- marked addressed / rejected / clarification-needed in addition to the
-- default 'open'. Tracks who flipped the status and when via the two
-- status_changed_* columns.
--
-- Pre-existing rows: at the time of this migration, the comments table
-- did not have a status column, so there is no backfill concern — every
-- existing row gets the column DEFAULT of 'open' and the new CHECK is
-- satisfied. The constraint is added as an immediate (validating) check.

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS status              text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS status_changed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by   uuid REFERENCES auth.users(id);

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_status_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_status_check
  CHECK (status IS NULL OR status IN ('open','addressed','rejected','clarification'));
