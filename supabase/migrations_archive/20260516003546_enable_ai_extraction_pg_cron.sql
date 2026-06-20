-- Enable scheduled reconciliation for stuck drawing AI extraction rows.
--
-- Migration 076 created public.reconcile_stuck_extractions() and only
-- scheduled it when pg_cron was already installed. Production had the
-- extension available but not installed, so this migration installs it
-- and idempotently wires the 5-minute schedule.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM cron.job
     WHERE jobname = 'reconcile-stuck-extractions'
  ) THEN
    PERFORM cron.unschedule('reconcile-stuck-extractions');
  END IF;

  PERFORM cron.schedule(
    'reconcile-stuck-extractions',
    '*/5 * * * *',
    $cmd$SELECT public.reconcile_stuck_extractions();$cmd$
  );
END
$do$;
