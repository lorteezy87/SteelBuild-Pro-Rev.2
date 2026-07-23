# Backup & Disaster Recovery Runbook

**SteelBuild Pro**
Date: 2026-07-22
Findings: [H24] (backups/PITR untested) · [H25] (Storage not backed up)

Refs:
- Supabase project: `kjrwqagyeswwoxpjkcko`
- Production: `https://steelbuild-pro.com`
- Vercel project: `steelbuildpro-og`
- Storage S3 endpoint: `https://kjrwqagyeswwoxpjkcko.storage.supabase.co/storage/v1/s3`

---

## 1. What is backed up (current state vs. required)

| Data | Current coverage | Gap |
|---|---|---|
| **Postgres database** (all tables: projects, drawings, submittals, RFIs, financials, activities audit trail, org/billing, etc.) | Supabase **daily automated backups**; **PITR** to be enabled (see owner-checklist H24) | Backups exist but were **never restore-tested** until the rehearsal below. |
| **Storage bucket `app-files`** (drawings, uploaded documents, exports) | Repository automation is implemented in `.github/workflows/storage-backup.yml`; Supabase database backups still do **not** include object bytes. [H25] | Owner must configure the offsite destination/secrets, capture the first successful verified manifest, and rehearse a restore. Until then there is no verified offsite backup. |
| **Storage bucket `email-attachments`** (inbound email attachments) | Covered by the same implemented workflow and verification contract. [H25] | Same operational enablement and restore-evidence gap. |
| **Edge function code** | In git (`supabase/functions/`) + deployed via CLI | Recoverable from git; must be **redeployed** after a project rebuild. |
| **Edge function secrets / env** | Supabase dashboard only | Not exported anywhere — must be **re-entered** from the owner's secret store on rebuild. |
| **Schema / migrations** | In git (`supabase/migrations/`) | Recoverable from git. |

> The critical gap is still **Storage recovery evidence**. The repository now contains the nightly offsite backup implementation, but code alone is not a backup. H25 stays open until the owner completes `storage-backup-setup.md`, retains a successful manifest for both buckets, and records a staging restore rehearsal below.

---

## 2. Recovery objectives (targets)

| Data | RPO (max acceptable data loss) | RTO (max acceptable downtime) |
|---|---|---|
| **Postgres database** | **15 minutes** (requires PITR enabled) | **4 hours** |
| **Storage buckets** | **24 hours** (nightly offsite sync) | **4 hours** |

- These are targets to design toward, not guarantees. The rehearsal (Section 4) exists to prove the actual measured RTO/RPO and close the gap between target and reality.
- Daily-backup-only (no PITR) yields an RPO of **up to ~24h** for the DB — that is why PITR is a prerequisite for the 15-minute DB RPO target.

---

## 3. Restore procedure

### 3.A Database — in-place PITR (preferred; corruption/bad-write recovery)

Use when the existing Supabase project is healthy but data was corrupted, mass-deleted, or a bad migration/write needs to be rolled back.

1. Identify the target timestamp (just **before** the incident). Check `activities` audit trail / Sentry / the reporting user for the incident time.
2. Supabase dashboard → `Database → Backups → Point-in-Time Recovery`.
3. Select the target timestamp and initiate the restore. **This overwrites the current DB to that point** — confirm the timestamp with a second person if possible; there is no undo of the undo.
4. Wait for the restore to complete.
5. Run the **post-restore verification** (Section 3.C).

### 3.B Database — restore into a NEW project (project loss / region failure)

Use when the Supabase project itself is unrecoverable (deleted, region outage with no in-place path).

1. Create a **new Supabase project** (note the new project ref and new URL).
2. Restore the latest backup / PITR snapshot into the new project (Supabase support or dashboard restore-to-new-project flow).
3. **Re-point the app** at the new project:
   - Update **`VITE_SUPABASE_URL`** (and the anon key if it changed) in the Vercel `steelbuildpro-og` project env.
   - **Redeploy** the frontend (push to `main` → CI deploy, or Vercel redeploy) so the new env is baked into the build.
4. **Redeploy every edge function** to the new project and **re-enter all edge secrets** (they do not travel with a DB restore):
   ```powershell
   # Deploy each function (repeat for: llm-proxy, schedule-assistant, email-ingest,
   # email-send, project-export, stripe-billing). Match each function's verify_jwt.
   npx supabase functions deploy <name> --project-ref <NEW_PROJECT_REF> [--no-verify-jwt]
   ```
   - `--no-verify-jwt` for: `llm-proxy`, `email-ingest`, `stripe-billing` (they do their own auth / are webhooks).
   - **Without** `--no-verify-jwt` for: `email-send`, `project-export`.
   - Re-set secrets: LLM keys, provider keys, `LLM_DAILY_COST_LIMIT_USD` / `LLM_DAILY_REQUEST_LIMIT`, `EMAIL_SEND_DAILY_LIMIT` / `EMAIL_CLASSIFY_DAILY_LIMIT`, `ALLOWED_ORIGINS`, Stripe keys + webhook secret.
   - Re-point the **Stripe webhook** endpoint (the `/webhook` route inside `stripe-billing`) at the new project URL in the Stripe dashboard.
5. **Restore Storage** (both buckets) from a verified offsite snapshot into the new project's Storage. Follow `storage-backup-setup.md#restore-rehearsal`, restore both buckets, and preserve the same object keys/paths so signed URLs and DB `file_url` references resolve.
6. Run the **post-restore verification** (Section 3.C).

### 3.C Post-restore verification (run after EVERY restore — 3.A or 3.B)

Do not declare recovery complete until all pass:

- [ ] **Login** succeeds (test with `nickl@shsteelaz.com`).
- [ ] **Project list** loads and shows the expected orgs/projects (multi-tenant isolation intact — a member sees only their projects).
- [ ] **Drawing register** opens for a known project and shows current revisions (`drawing_revisions.is_current` authority resolving correctly).
- [ ] **Open a signed-URL file** — open a drawing/PDF or download an attachment and confirm the file bytes actually load (this validates Storage restore, not just DB rows pointing at missing objects).
- [ ] **Audit trail** (`activities`) is present and append-only.
- [ ] (If 3.B) An **LLM feature** works end-to-end and produces an `llm_telemetry` success row (validates edge fn redeploy + secrets + CORS).
- [ ] (If 3.B) A **Stripe test-mode checkout** completes and the webhook updates `organizations.plan` (validates webhook re-point).

Record the outcome and the measured RTO/RPO in the rehearsal log below.

---

## 4. Restore rehearsal log

Run at least one rehearsal now (H24), then on a recurring cadence (recommend **quarterly**) and after any major schema change. Rehearse into the **staging** project (owner-checklist H3), never against prod.

| Date | Type (PITR in-place / restore-to-new) | Rehearsed by | Target ts / snapshot | Measured RTO | Measured RPO | Storage restored? | Verification (3.C) result | Notes / gaps found |
|---|---|---|---|---|---|---|---|---|
| _2026-07-22 (planned)_ | restore-to-new (staging) | | | | | | | Run after the first verified offsite manifest; establish baseline RTO/RPO. |
| | | | | | | | | |
| | | | | | | | | |

**After each rehearsal:** update Section 2 if measured numbers differ materially from targets, and file any discovered gaps (e.g. a secret that wasn't documented, a bucket path mismatch) as backlog items.

---

## 5. Storage backup operating evidence

The scheduled job is `.github/workflows/storage-backup.yml`; the server-only runner is `scripts/storage-backup.mjs`. Every successful run must:

1. cover both `app-files` and `email-attachments`;
2. write a timestamped, non-overwriting snapshot and update the `current` mirror;
3. run an exact path/size check against both destinations;
4. compare object counts and total bytes, including valid empty buckets; and
5. retain the verified JSON manifest in both the offsite destination and the GitHub Actions artifact, including `source.projectRef` matching the intended production Supabase project.

Before adding the environment secrets, configure `storage-backup-production` deployment branches/tags to **selected branches** with `main` only. The job has a defense-in-depth main-ref guard, so a feature-branch `workflow_dispatch` is rejected/skipped and must not receive production credentials.

Setup, secret rotation, retention, first-run acceptance, and the restore rehearsal are in `storage-backup-setup.md`.
