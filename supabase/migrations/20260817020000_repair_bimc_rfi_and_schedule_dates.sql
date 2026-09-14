-- Repair three confirmed BIMC date defects found during the 2026-08-17
-- authenticated QA smoke. Guards make the migration idempotent and prevent it
-- from overwriting a PM correction made between diagnosis and deployment.

update public.rfis
set submitted_date = date '2026-08-04',
    updated_at = now()
where id in (
  'a2ddeaba-b43f-4b62-a210-49f760e93e7d',
  'fa636c90-16e7-4449-8473-72e91f5b4431'
)
  and project_id = '9a085b09-df23-41d1-b0ab-55e2a04537f0'
  and submitted_date = date '2001-08-04';

-- The intended finish for this in-progress task is not known. Preserve its
-- known start and make the finish explicitly TBD instead of inventing a date.
update public.schedule_tasks
set end_date = null,
    updated_at = now()
where id = 'd833ffde-3d38-40e0-a154-3d914aaa3645'
  and project_id = '9a085b09-df23-41d1-b0ab-55e2a04537f0'
  and start_date = date '2026-07-28'
  and end_date = date '2026-07-23';
