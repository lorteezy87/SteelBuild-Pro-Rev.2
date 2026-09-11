# Offsite Storage Backup Setup and Restore Rehearsal

**SteelBuild Pro**
Date: 2026-07-22
Finding: [H25]

This runbook activates the implemented backup workflow for the Supabase Storage buckets `app-files` and `email-attachments`. The implementation is code-verified, but H25 remains open until a successful backup and staging restore are recorded.

## 1. Control design

The nightly workflow runs at 08:17 UTC and can also be started manually. For each required bucket it creates:

- `snapshots/<UTC timestamp>/<bucket>` — a non-overwriting point-in-time copy;
- `current/<bucket>` — a mirror for the fastest latest-state restore; and
- `manifests/<UTC timestamp>.json` — object counts, byte totals, and exact destination paths after verification.

A run fails unless both buckets pass `rclone check --size-only` against the snapshot and current mirror and their object counts and byte totals match the source. An empty bucket is valid only when all three locations report zero objects and zero bytes.

## 2. Owner setup

1. **Provision the destination outside Supabase.** Use a company-owned Azure Blob, S3, or other rclone-supported object-storage account with separate administrator access. Do not use a student account or the production Supabase project as the destination.
2. **Enable destination protections.** Turn on provider-side versioning or soft delete, restrict public access, and configure a documented lifecycle policy. The workflow does not delete timestamped snapshots; the provider lifecycle policy is the retention authority. Start with at least 35 daily snapshots until cost and recovery needs are measured.
3. **Generate Supabase Storage S3 access keys.** Create a dedicated key pair in the Supabase dashboard for this job. Store it only in the GitHub environment below and the approved company password/secret manager. Treat it as privileged server-side material and rotate it on personnel change or suspected exposure.
4. **Create an rclone destination configuration locally.** The remote must be named exactly `[offsite]`. Configure it interactively with `rclone config`, test read/write access to the dedicated backup container/bucket, and save only that remote in a temporary configuration file.
5. **Base64-encode the temporary configuration.** On PowerShell:

   ```powershell
   $configText = Get-Content -LiteralPath C:\secure-temp\rclone.conf -Raw
   [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($configText))
   ```

   Copy the result directly into GitHub Secrets, then securely remove the temporary file. Never commit the decoded configuration or paste it into an issue, log, or chat.
6. **Create the GitHub environment** `storage-backup-production`. Before adding secrets, set deployment branches/tags to **selected branches** with `main` only. The workflow additionally guards the job to `main`, so a feature-branch `workflow_dispatch` must be rejected/skipped and must not receive production credentials. Add these environment settings:

   | Setting | Value |
   |---|---|
   | `OFFSITE_RCLONE_CONFIG_B64` | Base64 configuration containing the `[offsite]` remote |
   | `OFFSITE_ROOT` | `offsite:<container-or-bucket>/steelbuild-pro-storage` |
   | `SUPABASE_S3_ACCESS_KEY_ID` | Dedicated Supabase Storage S3 access key ID |
   | `SUPABASE_S3_SECRET_ACCESS_KEY` | Dedicated Supabase Storage S3 secret key |
   | `SUPABASE_S3_ENDPOINT` | `https://kjrwqagyeswwoxpjkcko.storage.supabase.co/storage/v1/s3` |
   | `SUPABASE_S3_REGION` | `us-east-1` |
   | Environment variable `SUPABASE_EXPECTED_PROJECT_REF` | `kjrwqagyeswwoxpjkcko` (non-secret production project identity) |

7. **Configure failure ownership.** Ensure at least two owners receive failed GitHub Actions workflow notifications and know how to rotate both credential sets.

## 3. First-run acceptance

1. Open GitHub Actions → **Storage backup** → **Run workflow** from the default branch.
2. Confirm the job installed rclone only after the pinned SHA-256 checksum passed.
3. Confirm the log reports `Verified app-files` and `Verified email-attachments` without displaying credentials.
4. Download the `storage-backup-manifest-<run id>` artifact and confirm `status` is `verified`, `source.projectRef` matches the intended production project, both buckets are present, and the counts are plausible.
5. Confirm the same manifest exists under `manifests/<timestamp>.json` at the offsite destination.
6. Confirm snapshot objects exist beneath both timestamped bucket paths and the `current` paths.
7. Record the workflow URL, manifest timestamp, counts, bytes, and reviewer in the H25 evidence record. Do not close H25 yet; complete the restore rehearsal.

## 4. Restore rehearsal

Rehearse only into the staging Supabase project. Never overwrite production to test recovery.

1. Choose a successful manifest timestamp and start the RTO clock.
2. In staging, create private `app-files` and `email-attachments` buckets with the same file-size and MIME restrictions as production.
3. Create a temporary rclone configuration with:
   - the existing read-only-capable `[offsite]` destination remote; and
   - a `[staging]` S3 remote pointed at the staging Supabase Storage S3 endpoint using dedicated staging keys.
4. Preview both restores:

   ```powershell
   rclone copy "offsite:<container-or-bucket>/steelbuild-pro-storage/snapshots/<timestamp>/app-files" "staging:app-files" --metadata --dry-run
   rclone copy "offsite:<container-or-bucket>/steelbuild-pro-storage/snapshots/<timestamp>/email-attachments" "staging:email-attachments" --metadata --dry-run
   ```

5. Review the dry-run, remove `--dry-run`, and run both copies.
6. Verify exact object paths and sizes:

   ```powershell
   rclone check "offsite:<container-or-bucket>/steelbuild-pro-storage/snapshots/<timestamp>/app-files" "staging:app-files" --size-only
   rclone check "offsite:<container-or-bucket>/steelbuild-pro-storage/snapshots/<timestamp>/email-attachments" "staging:email-attachments" --size-only
   ```

7. Complete every applicable post-restore check in `backup-dr.md` Section 3.C, including opening real signed drawing and attachment URLs from staging.
8. Stop the RTO clock. Record measured RTO/RPO, manifest timestamp, bucket counts, verification results, and gaps in `backup-dr.md` Section 4.
9. Securely remove all temporary rclone configurations and rotate any credential that was exposed outside the approved secret manager.

## 5. Recurring operation

- Review the backup workflow every business day until failure alerting is proven, then at least weekly.
- Rehearse a restore quarterly and after material Storage path, bucket policy, or provider changes.
- Review lifecycle cost and retention quarterly. Do not shorten retention without an owner-approved recovery requirement.
- Rotate credentials at least annually and immediately on suspected exposure.
- H25 can be marked complete only while recent green manifests, working failure notifications, and a successful restore rehearsal are retained as evidence.
