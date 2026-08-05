-- 070: Add "Released for Fabrication" to submittals.status and
-- submittal_rounds.status CHECK constraints.
--
-- This status represents the final downstream step: the submittal
-- has been approved and the drawings are released for shop fabrication.

-- ── submittals.status ─────────────────────────────────────────────
ALTER TABLE public.submittals
  DROP CONSTRAINT IF EXISTS submittals_status_check;

ALTER TABLE public.submittals
  ADD CONSTRAINT submittals_status_check
  CHECK (status IN (
    'Draft',
    'Submitted',
    'Under Review',
    'Approved',
    'Approved as Noted',
    'Revise and Resubmit',
    'Rejected',
    'Released for Fabrication',
    'Void'
  ));

-- ── submittal_rounds.status ───────────────────────────────────────
ALTER TABLE public.submittal_rounds
  DROP CONSTRAINT IF EXISTS submittal_rounds_status_check;

ALTER TABLE public.submittal_rounds
  ADD CONSTRAINT submittal_rounds_status_check
  CHECK (status IN (
    'Submitted',
    'Under Review',
    'Approved',
    'Approved as Noted',
    'Revise and Resubmit',
    'Rejected',
    'Released for Fabrication'
  ));
