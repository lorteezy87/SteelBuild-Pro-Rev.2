# `app-files` legacy-path cutover runbook

Status: **implemented in repository; not executed remotely**. Production had
775 two-segment objects under `app-files/uploads/` on 2026-07-20. Recheck the
count at execution time.

## Safety contract

- Copy first; never move or delete `uploads/*` source objects.
- Keep the random maintenance-token preimage only in operator memory. Store
  only its SHA-256 hash in `private.maintenance_jobs`.
- The temporary function copies only `app-files/uploads/*` to
  `<founding_org_id>/uploads/*`, is idempotent, and returns aggregate counts.
- Rewrite DB references only after all destination metadata matches.
- Close the read/upload grandfather branch only after zero legacy DB refs.
- Retain originals as rollback material. Keep `account_deletion` disabled and
  do not deploy `account-delete` during this work.

Artifacts, in execution order:

1. `20260721030200_harden_trigger_and_split_write_policies.sql`
2. `supabase/functions/legacy-app-files-copy/index.ts`
3. `20260721031557_rewrite_app_files_legacy_references.sql`
4. `20260721031606_close_app_files_legacy_path_final.sql`
5. `supabase/functions/legacy-app-files-copy/disabled.ts`

Rehearse the exact sequence with synthetic data on staging first.

## Initialize authorization

Generate a high-entropy preimage in memory and store only its lowercase SHA-256
digest. Never put the preimage in SQL, source, a saved script, or a committed
artifact.

```sql
update private.maintenance_jobs
set token_sha256 = '<64-lowercase-hex-digest>',
    completed_at = null,
    completion_details = '{}'::jsonb
where job_key = 'legacy_app_files_copy'
  and completed_at is null
  and expected_project_ref = 'kjrwqagyeswwoxpjkcko';
```

Confirm exactly one row changed. The private table has RLS, no policies, and no
Data API role grants. The function reads it only through a service-role-only
security-definer RPC.

## Copy objects

Temporarily deploy the isolated function:

```powershell
npx supabase functions deploy legacy-app-files-copy --project-ref kjrwqagyeswwoxpjkcko --no-verify-jwt
```

POST to `/functions/v1/legacy-app-files-copy` with header
`x-sbp-maintenance-token: <in-memory-preimage>` and JSON body
`{ "offset": 0, "limit": 50 }`. Continue at `next_offset` until
`complete=true`. Stop on a nonzero `failed` count. Responses contain only
`scanned`, `copied`, `existing`, `verified`, `failed`, `next_offset`,
`complete`, and `originals_deleted=0`. Repeating a batch is safe.

The function is project-locked by the DB marker and accepts no bucket, prefix,
destination, or organization input. The observed production paths are all
top-level `uploads/<file>`, matching its bounded listing behavior.

## Rewrite references and close RLS

Apply `20260721031557_rewrite_app_files_legacy_references.sql`. It rewrites the
reviewed 23 scalar columns and comma-separated `change_orders.attachments` in a
transaction. It aborts before changes if a copy is missing/mismatched or an
attachment needs manual parsing.

Verify zero DB refs begin with `uploads/` and spot-check signed URLs. Then apply
`20260721031606_close_app_files_legacy_path_final.sql`. It repeats the guards,
copies source ownership onto each destination, removes the grandfather branch
from `auth_read` and `auth_upload`, sets the completion marker, and clears the
token hash atomically. Original objects remain retained.

Invoke the endpoint again; it must return HTTP 410. Replace `index.ts` with the
prepared `disabled.ts` and deploy the permanent 410 implementation.

## Local alternative and rollback

If a service-role key is available, the local script supports inventory, copy,
rewrite, verify, and manifest-driven reference rollback:

```powershell
node scripts/storage-backfill-legacy-uploads.mjs --help
```

Mutations require pinned object/reference counts and an operator-selected
mode-0600 manifest. Before RLS closure, reverse only the exact founding-org
prefix using that manifest. After closure, also restore the former policy
branches from migration history. Rehearse rollback on staging. Do not delete
retained originals without a separate retention decision and verified backup.
