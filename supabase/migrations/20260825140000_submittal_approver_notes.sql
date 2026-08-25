-- Approver Notes — questions for EOR/AOR on a submittal package.
--
-- Each element is { id, note, response, created_at, responded_at }.
-- A note with text and an empty response flags the package
-- Incomplete — Pending EOR/AOR Response (client: src/lib/approverNotes.ts).
-- Additive jsonb on submittals so existing RLS covers it.

ALTER TABLE public.submittals
  ADD COLUMN IF NOT EXISTS approver_notes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.submittals.approver_notes IS
  'Q&A pairs for EOR/AOR: [{id, note, response, created_at, responded_at}]. Unanswered notes flag Incomplete — Pending EOR/AOR Response.';

CREATE INDEX IF NOT EXISTS idx_submittals_approver_notes_present
  ON public.submittals (project_id)
  WHERE COALESCE(is_deleted, false) = false
    AND approver_notes <> '[]'::jsonb;
