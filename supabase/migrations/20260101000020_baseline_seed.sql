-- ─────────────────────────────────────────────────────────────────────────────
-- BASELINE (3/3) — storage buckets, storage RLS policies, scheduled jobs
--
-- Config the public-schema dump (2/3) can't carry. The `storage` schema itself is
-- Supabase-MANAGED (its tables/types/functions exist on every project and can't be
-- recreated by the migration role — that's why the baseline dumps `--schema public`
-- only). Here we only (re)create the APP's storage artifacts: the bucket rows and
-- the RLS policies on storage.objects. Each block is GUARDED so that on an env where
-- the migration role lacks privilege on the managed storage schema, it logs a notice
-- and skips instead of failing the whole replay. On prod these already exist (the
-- baseline is marked applied via `migration repair`, never re-run).
--
-- Applied LAST in the baseline, after the public dump (2/3) so the public functions
-- the storage policies call (user_is_org_member / founding_org_id /
-- user_has_project_access) already exist. Idempotent.
-- See docs/db-baseline-cutover.md. Verified against live kjrwqagyeswwoxpjkcko 2026-06-20.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Storage buckets (app-files private 50MB w/ MIME allowlist; email-attachments private 25MB) ──
do $$
begin
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
    public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('email-attachments', 'email-attachments', false, 26214400, null)
  on conflict (id) do update set
    public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
exception
  when insufficient_privilege then raise notice 'storage.buckets seed skipped: insufficient privilege on managed storage schema';
  when others then raise notice 'storage.buckets seed skipped: %', sqlerrm;
end $$;

-- ── Storage RLS policies on storage.objects (app-files + email-attachments access) ──
do $$
begin
  drop policy if exists "auth_delete" on "storage"."objects";
  create policy "auth_delete" on "storage"."objects" for delete to "authenticated" using ((("bucket_id" = 'app-files'::"text") AND ("owner" = "auth"."uid"())));

  drop policy if exists "auth_read" on "storage"."objects";
  create policy "auth_read" on "storage"."objects" for select to "authenticated" using ((("bucket_id" = 'app-files'::"text") AND (((("storage"."foldername"("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::"text") AND "public"."user_is_org_member"((("storage"."foldername"("name"))[1])::"uuid")) OR ((("storage"."foldername"("name"))[1] = 'uploads'::"text") AND "public"."user_is_org_member"("public"."founding_org_id"())))));

  drop policy if exists "auth_update" on "storage"."objects";
  create policy "auth_update" on "storage"."objects" for update to "authenticated" using ((("bucket_id" = 'app-files'::"text") AND ("owner" = "auth"."uid"()))) with check ((("bucket_id" = 'app-files'::"text") AND ("owner" = "auth"."uid"())));

  drop policy if exists "auth_upload" on "storage"."objects";
  create policy "auth_upload" on "storage"."objects" for insert to "authenticated" with check ((("bucket_id" = 'app-files'::"text") AND (((("storage"."foldername"("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::"text") AND "public"."user_is_org_member"((("storage"."foldername"("name"))[1])::"uuid")) OR ((("storage"."foldername"("name"))[1] = 'uploads'::"text") AND "public"."user_is_org_member"("public"."founding_org_id"())))));

  drop policy if exists "email_attachments_select" on "storage"."objects";
  create policy "email_attachments_select" on "storage"."objects" for select to "authenticated" using ((("bucket_id" = 'email-attachments'::"text") AND (("storage"."foldername"("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::"text") AND "public"."user_has_project_access"((("storage"."foldername"("name"))[1])::"uuid")));
exception
  when insufficient_privilege then raise notice 'storage.objects policies skipped: insufficient privilege on managed storage schema';
  when others then raise notice 'storage.objects policies skipped: %', sqlerrm;
end $$;

-- ── Scheduled jobs (pg_cron). Guarded: requires pg_cron + the referenced public
-- functions (created by baseline 2/3). The stale stripe-sync-worker job (404/min on
-- the deleted stripe-worker fn) was unscheduled 2026-06-20 and is NOT recreated. ──
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('reconcile-stuck-extractions', '*/5 * * * *', 'SELECT public.reconcile_stuck_extractions();');
    perform cron.schedule('escalate-rfi-sla',            '0 13 * * *',  'SELECT public.escalate_rfi_sla();');
  else
    raise notice 'pg_cron not installed — skipped scheduling jobs';
  end if;
exception when others then
  raise notice 'pg_cron job scheduling skipped: %', sqlerrm;
end $$;
