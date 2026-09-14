-- schedule_tasks is soft-delete in production: the sibling app's m10_schedule
-- (ledger 20260909062929) added is_deleted and deleted_at, but no Rev.2
-- migration does. The rollup fix applied next watches is_deleted, so every
-- fresh Rev.2 environment failed there with "column new.is_deleted does not
-- exist". Add both columns exactly as production defines them. Wherever they
-- already exist, including production, this changes nothing. The sibling
-- app's delete guard (enforce_schedule_task_guards) is deliberately not added.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.schedule_tasks
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
