# app-files tenant isolation — remediation plan (DRAFT for review)

> Status: **draft / not executed.** Author: AI agent, 2026-06-16. Verified against the
> live Pro DB (`kjrwqagyeswwoxpjkcko`) read-only. Nothing in here has been applied.

## TL;DR — severity is lower than the backlog implies

The old audit flagged an "app-files cross-tenant READ residual" as a P1. **As of today it is
not an active cross-tenant breach** — it's path-uniformity tech debt plus a special-case RLS
rule that should be retired before the app goes truly multi-tenant. Reasoning is in
"Why it's safe today" below. Recommend treating it as **hardening to complete before
onboarding org #2**, not an emergency.

## Verified current state (live, read-only)

- Bucket `app-files`: **807 objects** — **775 flat** `uploads/<ts>-<rand>.<ext>` (legacy, no
  tenant prefix) and **32 org-prefixed** `<org_id>/uploads/...` (all under S&H).
- **One organization exists:** `733042ba-4c06-45a9-8ae5-9ff949b6dbb8` = **"S&H Steel"** (the
  founding org). `founding_org_id()` returns the oldest org = S&H.
- Storage RLS on `storage.objects` (bucket `app-files`):
  - `auth_read` (SELECT): `bucket_id='app-files' AND ( (folder[1] is a UUID AND user_is_org_member(folder[1])) OR (folder[1]='uploads' AND user_is_org_member(founding_org_id())) )`
  - `auth_upload` (INSERT, WITH CHECK): same predicate — a write must land under an org you
    belong to, or flat `uploads/` only if you're a founding-org member.
  - `auth_update` / `auth_delete`: `owner = auth.uid()` (owner-only).
- Client (`src/api/supabaseClient.ts`): `UploadFile` writes `<org_id>/uploads/<ts>-<rand>.<ext>`
  when an org context exists, else flat `uploads/...`. `file_url` stores the **bare storage
  path**; `resolveFileUrl` → `getSignedUrl(path)` against `app-files`.

## Why it's safe today

1. All 775 flat files were created **before** org-prefixing existed, when S&H was the only
   tenant — so every flat file genuinely belongs to S&H.
2. `auth_upload`'s WITH CHECK only lets a **founding-org (S&H) member** create a flat
   `uploads/` object. A future non-S&H tenant's uploads always get their own `<org_id>/`
   prefix and they're **denied** from writing flat — so no non-S&H file can ever land flat.
3. `auth_read` grandfathers flat files to S&H members only. A new tenant (or an org-less
   signup) is not an S&H member → **cannot read** the flat files. S&H members reading S&H's
   own files is correct.

Net: the grandfather rule is sound for the single-tenant reality and cannot leak across
tenants given the upload constraint. The problem is **fragility**, not exposure: isolation
of 775 files rests on a special-case ("founding org owns everything flat") instead of each
file carrying its real owner in the path.

## The fix (uniform org-prefixed paths, retire the special case)

Every flat path becomes `<S&H org id>/` + the existing path. The transformation is a pure
prefix in both storage and DB refs:

```
uploads/1775517948917-335j484w0jo.pdf
  → 733042ba-4c06-45a9-8ae5-9ff949b6dbb8/uploads/1775517948917-335j484w0jo.pdf
```

Then drop the grandfather clause so RLS is uniform (`<org_id>/...` gated by membership, no
exceptions).

### Phase 0 — discovery (run live, read-only)

Confirm exact ref counts per column before touching anything. Candidate path columns
(from `information_schema`, filtered to app-files-style storage paths — excludes
`email_attachments.*` [separate bucket], `*.file_name`, SharePoint/external `external_*` /
`folder_*`, and the steel-section `profile` columns):

```
drawings.file_url, drawings.thumbnail_url, drawing_sets.file_url, drawing_revisions.file_url,
drawing_analyses.file_url, drawing_analyses.storage_path, drawing_signoffs.signature_url,
submittals.file_url, submittal_rounds.file_url, submittal_rounds.markup_file_url,
submittal_sheet_responses.markup_file_url, documents.file_url, photos.file_url,
expenses.receipt_url, model_registry.file_url, model_registry.cloud_url,
scope_items.file_url, scope_items.storage_path, mitigation_actions.proof_url,
deliveries.shipping_ticket_path, deliveries.shipping_ticket_url, uploaded_files.file_url,
user_profiles.avatar_url, change_orders.attachments  ⚠ (see note)
```

Generator — emits one counting query per candidate column so you get exact numbers:

```sql
select string_agg(
  format('select %L tbl, %L col, count(*) n from public.%I where %I like ''uploads/%%''',
         table_name, column_name, table_name, column_name),
  E'\nunion all\n')
from information_schema.columns
where table_schema='public' and data_type in ('text','character varying')
  and column_name in ('file_url','thumbnail_url','storage_path','signature_url',
       'markup_file_url','receipt_url','cloud_url','proof_url','shipping_ticket_path',
       'shipping_ticket_url','avatar_url');
-- then run the emitted UNION ALL to get per-column flat-ref counts.
```

> ⚠ `change_orders.attachments` is free-form text (may be a JSON array / CSV of several
> paths). Do **not** blind-prefix it — inspect and transform per row in the script.

### Phase 1 — copy storage objects (additive, reversible)

Service-role script. Copy (not move) so the originals stay readable via the grandfather
rule during the transition; idempotent (skip if dest exists).

```js
// scripts/migrate-appfiles-prefix.mjs  (run with SUPABASE_SERVICE_ROLE_KEY; DRY_RUN first)
import { createClient } from '@supabase/supabase-js';
const ORG = '733042ba-4c06-45a9-8ae5-9ff949b6dbb8';
const DRY = process.env.DRY_RUN !== '0';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// page through storage.objects under uploads/ and copy each to `${ORG}/<name>`
// (list via the storage API or select name from storage.objects where bucket_id='app-files'
//  and name like 'uploads/%'); for each:  sb.storage.from('app-files').copy(name, `${ORG}/${name}`)
// skip when the dest already exists; log every src→dest to a manifest for rollback.
```

### Phase 2 — backfill DB refs (transactional per column)

For each confirmed column (after Phase 0 counts), within a transaction:

```sql
update public.drawings        set file_url      = '733042ba-4c06-45a9-8ae5-9ff949b6dbb8/' || file_url      where file_url      like 'uploads/%';
update public.drawings        set thumbnail_url = '733042ba-4c06-45a9-8ae5-9ff949b6dbb8/' || thumbnail_url where thumbnail_url like 'uploads/%';
-- …repeat for every confirmed column…
-- change_orders.attachments handled in-script (parse → prefix each contained path).
```

Apply as a migration in `supabase/migrations/` (so repo history matches live), per CLAUDE.md §15.

### Phase 3 — verify

```sql
-- 0 flat refs remaining (re-run the Phase-0 generator → all counts 0)
-- 0 flat storage objects remaining only AFTER Phase 4
select count(*) from storage.objects where bucket_id='app-files' and name like 'uploads/%'; -- pre-cleanup: still 775
```
Spot-check a sample of migrated records resolve via `getSignedUrl` in-app (S&H login).

### Phase 4 — delete the old flat objects (after verification)

Script deletes each original `uploads/...` only once its `${ORG}/uploads/...` copy exists and
all refs are repointed. Keep the manifest for rollback.

### Phase 5 — tighten RLS (final migration)

Once 0 flat objects and 0 flat refs remain, drop the grandfather clause:

```sql
-- supabase/migrations/<ts>_appfiles_drop_grandfather.sql
alter policy "auth_read" on storage.objects using (
  bucket_id = 'app-files'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and user_is_org_member(((storage.foldername(name))[1])::uuid)
);
alter policy "auth_upload" on storage.objects with check (
  bucket_id = 'app-files'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and user_is_org_member(((storage.foldername(name))[1])::uuid)
);
notify pgrst, 'reload schema';
```
(Leave `auth_update`/`auth_delete` owner-only as-is.)

## Rollback

- Phase 1/4 are reversible via the copy manifest (re-copy dest→src, or just don't delete).
- Phase 2 reversible: `set col = substr(col, length('<org>/')+1) where col like '<org>/uploads/%'`.
- Phase 5 reversible: re-add the grandfather `OR` branch (kept in git history).
- Because Phase 1 is copy-first and Phase 4 (delete) is last, there is **no broken-link
  window** — both old and new paths exist (and are readable) until verification passes.

## Risks

- **775 storage copy/delete ops** on prod — rate limits / partial failure → idempotent + manifest + resumable.
- **`change_orders.attachments`** free-form text — needs per-row parsing, not a blind prefix.
- Any ref already stored as a full `https://…signed…` URL (not a path) won't match `uploads/%`
  — those are stale/expired anyway and out of scope.
- Do Phase 5 **only** after Phases 1–4 verify clean, or flat files become unreadable.

## Recommendation

No active leak today, and the change is mechanical but touches 775 prod objects. Suggest
running it in a **maintenance window before onboarding the second org** (the moment the
grandfather assumption stops being trivially true), with `DRY_RUN` first and the manifest
retained. I can implement the script + migrations when you want to schedule it.
