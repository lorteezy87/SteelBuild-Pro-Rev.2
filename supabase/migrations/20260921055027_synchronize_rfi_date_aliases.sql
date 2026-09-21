-- Both names remain available to the two applications sharing this database.
-- Fill only an absent alias from recorded evidence; never invent a date.
-- Reject conflicting existing dates rather than choosing one silently.
SET LOCAL lock_timeout = '5s';

DO $validate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.rfis
    WHERE (date_required IS NOT NULL AND due_date IS NOT NULL AND date_required <> due_date)
       OR (date_answered IS NOT NULL AND responded_date IS NOT NULL AND date_answered <> responded_date)
  ) THEN
    RAISE EXCEPTION 'Resolve conflicting RFI date aliases before applying this migration';
  END IF;
END
$validate$;

CREATE OR REPLACE FUNCTION public.sync_rfi_date_aliases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.date_required IS NOT NULL AND NEW.due_date IS NOT NULL AND NEW.date_required <> NEW.due_date
       OR NEW.date_answered IS NOT NULL AND NEW.responded_date IS NOT NULL AND NEW.date_answered <> NEW.responded_date THEN
      RAISE EXCEPTION 'Conflicting RFI date aliases' USING ERRCODE = '23514';
    END IF;
    NEW.date_required := coalesce(NEW.date_required, NEW.due_date);
    NEW.due_date := NEW.date_required;
    NEW.date_answered := coalesce(NEW.date_answered, NEW.responded_date);
    NEW.responded_date := NEW.date_answered;
  ELSE
    IF NEW.date_required IS DISTINCT FROM OLD.date_required THEN
      IF NEW.due_date IS DISTINCT FROM OLD.due_date AND NEW.due_date IS DISTINCT FROM NEW.date_required THEN
        RAISE EXCEPTION 'Conflicting RFI required dates' USING ERRCODE = '23514';
      END IF;
      NEW.due_date := NEW.date_required;
    ELSIF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      NEW.date_required := NEW.due_date;
    END IF;
    IF NEW.date_answered IS DISTINCT FROM OLD.date_answered THEN
      IF NEW.responded_date IS DISTINCT FROM OLD.responded_date AND NEW.responded_date IS DISTINCT FROM NEW.date_answered THEN
        RAISE EXCEPTION 'Conflicting RFI answered dates' USING ERRCODE = '23514';
      END IF;
      NEW.responded_date := NEW.date_answered;
    ELSIF NEW.responded_date IS DISTINCT FROM OLD.responded_date THEN
      NEW.date_answered := NEW.responded_date;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.sync_rfi_date_aliases() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_sync_rfi_date_aliases
  BEFORE INSERT OR UPDATE OF date_required, due_date, date_answered, responded_date
  ON public.rfis FOR EACH ROW EXECUTE FUNCTION public.sync_rfi_date_aliases();

UPDATE public.rfis
SET date_required = coalesce(date_required, due_date),
    due_date = coalesce(date_required, due_date),
    date_answered = coalesce(date_answered, responded_date),
    responded_date = coalesce(date_answered, responded_date)
WHERE date_required IS DISTINCT FROM due_date OR date_answered IS DISTINCT FROM responded_date;

NOTIFY pgrst, 'reload schema';
