-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ daily_logs.materials_received                                              │
-- │                                                                            │
-- │ DailyLogForm captures "Materials Received" and DailyLogsList renders it,  │
-- │ but the column was only in migrations_archive/028 and never re-baselined. │
-- │ Creates fail with PGRST204:                                                │
-- │   Could not find the 'materials_received' column of 'daily_logs'          │
-- │   in the schema cache                                                      │
-- ╰────────────────────────────────────────────────────────────────────────────╯

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS materials_received text;

COMMENT ON COLUMN public.daily_logs.materials_received IS
  'Free-text materials received that day (field superintendent daily log).';
