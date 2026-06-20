-- Close the app-files storage cross-tenant READ leak. The bucket's SELECT policy
-- was `bucket_id = 'app-files'` (every authenticated user could read every tenant's
-- files), and uploads were flat `uploads/<ts>-<rand>` with no tenant prefix.
--
-- New uploads are now `<org_id>/uploads/...` (see api/supabaseClient.ts UploadFile);
-- the ~774 legacy flat files predate org-prefixing and all belong to the founding
-- org (S&H), so they're grandfathered to its members only. UPDATE/DELETE were
-- already owner-scoped; email-attachments already project-scoped.

-- The GLOBAL oldest org, resolved with definer rights so it's identical for every
-- caller (an inline `select ... limit 1` would be RLS-filtered per caller and let a
-- future tenant claim the legacy files).
create or replace function public.founding_org_id()
returns uuid language sql stable security definer set search_path to ''
as $$
  select id from public.organizations order by created_at limit 1
$$;

-- READ: org-prefixed paths -> org members; legacy flat uploads/... -> founding org.
alter policy auth_read on storage.objects
  using (
    bucket_id = 'app-files' and (
      ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.user_is_org_member(((storage.foldername(name))[1])::uuid))
      or ((storage.foldername(name))[1] = 'uploads'
        and public.user_is_org_member(public.founding_org_id()))
    )
  );

-- UPLOAD: scope to an org the caller belongs to. Accepts org-prefixed paths (new
-- clients) and legacy flat uploads/... (transition / stale tabs -> founding org),
-- both membership-gated so no one can plant files in another tenant's space.
alter policy auth_upload on storage.objects
  with check (
    bucket_id = 'app-files' and (
      ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.user_is_org_member(((storage.foldername(name))[1])::uuid))
      or ((storage.foldername(name))[1] = 'uploads'
        and public.user_is_org_member(public.founding_org_id()))
    )
  );
