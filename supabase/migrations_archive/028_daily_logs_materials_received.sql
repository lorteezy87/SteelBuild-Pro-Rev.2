-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 028 — Add materials_received column to daily_logs                          │
-- │                                                                              │
-- │ DailyLogForm.jsx captures a "Materials Received" textarea and DailyLogsList │
-- │ renders log.materials_received, but the column was never created. Every    │
-- │ save attempt failed with PGRST204 "Could not find the 'materials_received' │
-- │ column of 'daily_logs' in the schema cache".                               │
-- ╰────────────────────────────────────────────────────────────────────────────╯

ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS materials_received TEXT;
