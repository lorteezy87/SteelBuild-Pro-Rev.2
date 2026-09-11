# Supabase Storage backups to Backblaze B2

The Storage backup workflow backs up `app-files`, `email-attachments`, and `sheets-files` from the expected Supabase project. It keeps one current copy and B2's native historical versions, rather than creating a full copy every day. It never permanently deletes versions or runs cleanup. Expiration lifecycle rules cause the job to fail before transferring data.

## Configuration

GitHub Actions environment: `storage-backup-production`. Repository secrets are inherited; environment secrets take precedence.

Secrets:
- `OFFSITE_ROOT`: `offsite:YOUR-BUCKET/steelbuild-pro-storage`
- `OFFSITE_RCLONE_CONFIG_B64`: Base64 of the following native rclone configuration (no additional options):

```ini
[offsite]
type = b2
account = APPLICATION_KEY_ID
key = APPLICATION_KEY
```

- `SUPABASE_S3_ACCESS_KEY_ID` and `SUPABASE_S3_SECRET_ACCESS_KEY`: generated Supabase Storage S3 credentials, not frontend API keys.
- `SUPABASE_S3_ENDPOINT`: `https://kjrwqagyeswwoxpjkcko.storage.supabase.co/storage/v1/s3`
- `SUPABASE_S3_REGION`: `us-east-1`

Environment variable: `SUPABASE_EXPECTED_PROJECT_REF=kjrwqagyeswwoxpjkcko`.

Use a private B2 bucket and a bucket-restricted read/write application key without a filename-prefix restriction. The key must permit listing the bucket and its versions, reading objects, writing objects, and hiding deleted objects. The job reads the whole bucket for accounting. Remove lifecycle rules that automatically hide current files or delete hidden versions. The job checks rules but does not alter them. Keep this bucket exclusive to this workflow; concurrent external uploads invalidate any client-side projection.

## Storage budget and limitations

The default budget is **9,000,000,000 bytes** for this bucket. Before destination writes the job reads all native B2 versions, across every prefix in the bucket. It rejects incomplete pagination, unavailable inventory, or unfinished multipart uploads. Unfinished uploads must be inspected by an operator; nothing is automatically purged.

It stages the three source buckets in the runner's temporary directory, calculates SHA-1 checksums, and compares them with the destination. The projection is retained bytes + changed/new file bytes + a 10 MB manifest/probe reserve. Deletions never subtract retained bytes. Over-budget runs fail before syncing and appear as failed GitHub Actions runs. Enable GitHub Actions failure notifications to receive alerts. Old verified manifests remain usable; no new successful backup is claimed.

This is a conservative client-side storage guard, **not an account billing cap**. Other B2 buckets, simultaneous external writers, provider accounting, request fees, and source egress are outside this calculation. At the measured 6.4 GB source size, staging downloads about 6.4 GB per daily run (roughly 192 GB over 30 days), plus failed-run retries. Check the Supabase project's remaining egress allowance. Only new/changed content is uploaded to B2. The job removes its local staging directory on completion/failure; an `always()` workflow step cleans up on cancellation.

At capacity, the scheduled job continues to fail and notify; it does not disable itself or delete history. Review storage growth, then explicitly choose a larger budget or a retention policy. Free storage cannot preserve unlimited changes indefinitely.

## Verification and recovery evidence

Each bucket is checked by SHA-1 against the staged source. The job restores one file from each nonempty bucket using `--b2-version-at` and checks its contents. A synthetic probe is uploaded, overwritten, hidden, and recovered from its earlier version; its original contents must match. Probe history consumes a small amount of storage and is included in later budgets.

Only after verification is a schema-version-2 manifest written to `manifests/<timestamp>.json` and retained as a GitHub artifact. It contains source identity, object paths/sizes/SHA-1 hashes, a per-bucket `restoreAt`, storage projection, and restore-test evidence. Files contain the staged source observed during the run; this is not an atomic database-and-storage snapshot. Database backups remain separate. A failed run may partially update current objects, but prior versions remain retained.

## Restore without touching production

Never overwrite production to test recovery.

Download a verified manifest from GitHub Actions. For each bucket, use that bucket's exact `restoreAt` timestamp. Use a fresh empty local destination, never the production Supabase remote:

```bash
rclone copy offsite:YOUR-BUCKET/steelbuild-pro-storage/current/app-files ./restore/app-files --b2-version-at 'RESTORE_AT_FROM_APP_FILES'
rclone copy offsite:YOUR-BUCKET/steelbuild-pro-storage/current/email-attachments ./restore/email-attachments --b2-version-at 'RESTORE_AT_FROM_EMAIL_ATTACHMENTS'
rclone copy offsite:YOUR-BUCKET/steelbuild-pro-storage/current/sheets-files ./restore/sheets-files --b2-version-at 'RESTORE_AT_FROM_SHEETS_FILES'
```

Compare every restored file's SHA-1, size, and path with the manifest before any production restoration. `--b2-version-at` resolves actual object history and avoids selecting synthetic version filenames. Do not run `rclone cleanup`, `cleanup-hidden`, `purge`, or enable `--b2-hard-delete`: those remove recovery history.

## Activation

Keep the workflow disabled until the updated code has passed a manual run and is merged to `main`. Manual dispatch can test a reviewed branch; schedules use `main`. Re-enable the workflow only after the new implementation is on `main`, then confirm the next scheduled run. Schedule: daily at 08:17 UTC (GitHub can delay execution).

References: [rclone B2 versions](https://rclone.org/b2/#versions), [B2 native inventory](https://www.backblaze.com/apidocs/b2-list-file-versions), [Supabase S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication).
