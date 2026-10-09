# Atomic drawing revision candidate acceptance

This isolated harness verifies `supabase/candidates/drawing-set-revision-transaction.sql`.
The candidate is **not a migration** and must remain uninstalled until the upload
adapters, protected direct-write cutover, hosted rollback and release review pass.

Run quick behavioral checks:

```powershell
npm ci --prefix supabase/tests/drawing-set-revision-transaction --ignore-scripts
npm test --prefix supabase/tests/drawing-set-revision-transaction
```

The dedicated GitHub Actions workflow runs the same cases plus independent
PostgreSQL 17 sessions. It uses a disposable synthetic loopback database, no
Supabase credentials, no external storage bytes and no hosted database writes.
Local actual-PostgreSQL execution requires both `DRAWING_UPLOAD_POSTGRES_TEST=1`
and `DRAWING_UPLOAD_POSTGRES_URL` pointing at the exact empty loopback database
`steelbuild_drawing_upload_test`. The runner recreates only that verified test
database's fixture schemas between cases; never point it at an application DB.

The fixture extracts committed baseline drawing tables, constraints, FKs and
relevant activity/count/watch/validation triggers, plus the exact revision-manifest
migration and existing workflow helpers. Controllable test membership/MFA
predicates represent revocation. This is not hosted-policy or authenticated UI
acceptance. The full concurrent/boundary job and candidate source must be reviewed
again before any promotion.

Revised/added pages require explicit per-field extraction states. Tests distinguish
unavailable (NULL) from inspected-empty, retain actual old parent observations
privately, bind extraction to idempotent payloads, and preserve existing erasure
and immutable-evidence behavior. The PostgreSQL maximum workload includes exactly
4 MiB of serialized prior observations, over-bound refusal and late-write rollback.
These private observations are not in the current v2 project export/restore.

The four intentionally failing upload UI tests remain uncommitted in the owning
worktree, pending the coordinated typed adapter. They are not waived, deleted or
weakened by this server-only candidate.
