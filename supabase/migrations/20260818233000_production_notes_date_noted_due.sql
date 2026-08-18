-- production_notes: date_noted (when captured) + date_due (action required)
-- Idempotent; safe to re-run.

ALTER TABLE public.production_notes
  ADD COLUMN IF NOT EXISTS date_noted DATE,
  ADD COLUMN IF NOT EXISTS date_due   DATE;

COMMENT ON COLUMN public.production_notes.date_noted IS 'Date the note was recorded (may differ from meeting note_date)';
COMMENT ON COLUMN public.production_notes.date_due   IS 'Date action on this bullet is due';

-- Back-fill date_noted from note_date where missing
UPDATE public.production_notes
SET date_noted = note_date
WHERE date_noted IS NULL AND note_date IS NOT NULL;
