-- 076_ai_extraction_reconciler.sql
--
-- Server-side reset of stuck AI-extraction rows. Replaces the
-- client-side reconciliation that used to live in Drawings.jsx and
-- could only run when a user happened to mount the page.
--
-- The function is idempotent and safe to call from any scheduler
-- (pg_cron when available, edge function otherwise). It flips any
-- drawing whose ai_extraction_status has been 'Extracting' for more
-- than 5 minutes back to 'Failed' so the UI stops lying. The
-- threshold matches the longest realistic Claude call (~2 min) plus
-- buffer.
CREATE OR REPLACE FUNCTION public.reconcile_stuck_extractions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  fixed_count integer;
BEGIN
  UPDATE public.drawings
  SET ai_extraction_status = 'Failed',
      ai_extraction_error  = 'Reset by server-side reconciler: stuck in Extracting > 5 minutes'
  WHERE ai_extraction_status = 'Extracting'
    AND COALESCE(last_extracted_at, updated_at, created_at) < now() - interval '5 minutes';
  GET DIAGNOSTICS fixed_count = ROW_COUNT;
  RETURN fixed_count;
END;
$$;

-- Schedule via pg_cron when the extension is installed. If pg_cron
-- isn't available (e.g. local dev), the DO block is a no-op and the
-- function still exists for manual invocation / edge-function wiring.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'reconcile-stuck-extractions',
      '*/5 * * * *',
      'SELECT public.reconcile_stuck_extractions()'
    );
  END IF;
END $$;
