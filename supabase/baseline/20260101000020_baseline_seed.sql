-- ─────────────────────────────────────────────────────────────────────────────
-- BASELINE (3/3) — storage buckets + scheduled jobs
--
-- Config the schema dump can't carry: storage.buckets ROWS (pg_dump --schema-only
-- excludes data) and the pg_cron jobs. Applied LAST in the squashed baseline,
-- after the schema dump (2/3) so the functions the cron jobs call already exist.
--
-- Part of the DB-baseline cutover — see docs/db-baseline-cutover.md. Idempotent.
-- Verified against live kjrwqagyeswwoxpjkcko 2026-06-20.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Storage buckets ─────────────────────────────────────────────────────────
-- app-files: private, 50 MB cap, construction-document MIME allowlist. Originally
-- created by hand in the dashboard (002_storage.sql assumed it existed), so it is
-- in NO migration — recreate it faithfully here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-files', 'app-files', false, 52428800,
  array[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml','image/tiff','image/bmp',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv','text/plain','text/xml',
    'model/gltf-binary','model/gltf+json','model/obj','model/stl',
    'application/x-step','application/acad','application/dxf',
    'application/zip','application/x-zip-compressed','application/xml','application/json',
    'video/mp4','video/quicktime','application/octet-stream'
  ]
)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- email-attachments: private, 25 MB cap, no MIME restriction (inbound email fan-in).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-attachments', 'email-attachments', false, 26214400, null)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Scheduled jobs (pg_cron) ────────────────────────────────────────────────
-- Guarded: a fresh project/branch may not have pg_cron enabled, and the core
-- baseline must still replay. cron.schedule(name, ...) upserts by name (pg_cron
-- >= 1.4). Requires the referenced functions (created by baseline 2/3, the dump).
-- NOTE: the stale `stripe-sync-worker` job (POSTed the deleted stripe-worker fn,
-- 404/min) was unscheduled 2026-06-20 and is deliberately NOT recreated here.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('reconcile-stuck-extractions', '*/5 * * * *', 'SELECT public.reconcile_stuck_extractions();');
    perform cron.schedule('escalate-rfi-sla',            '0 13 * * *',  'SELECT public.escalate_rfi_sla();');
  else
    raise notice 'pg_cron not installed — skipped scheduling reconcile-stuck-extractions / escalate-rfi-sla';
  end if;
exception when others then
  raise notice 'pg_cron job scheduling skipped: %', sqlerrm;
end $$;
