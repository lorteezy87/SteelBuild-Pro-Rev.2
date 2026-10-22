# Append-only activity and audit candidate

Run `npm ci --ignore-scripts` and `npm test` here. The harness verifies the
uninstalled candidate `supabase/candidates/append-only-activity-audit.sql`.

It builds `drawing_activity`, `submittal_activity` and `pma_audit_logs` from the
committed baseline definitions and replays their committed policy history
(baseline, `20260620231716`, `20260702034009`, `20260721030200`). Project-access
helpers are stubs over `user_projects`; their real semantics are covered by the
membership-revocation harness.

Before the candidate it proves three holes exist: a field member can rewrite
`drawing_activity`, delete `submittal_activity`, and any project member can
insert a forged `pma_audit_logs` row. After the candidate it proves reads still
work and stay project-scoped, UPDATE/DELETE/TRUNCATE and client audit INSERT are
refused, `audit_log_trigger()` (SECURITY DEFINER) still records submittal
changes with the acting user, field members can still append activity rows,
FK cascades still clear a deleted submittal's activity, re-application is a
no-op, and the file refuses to run if a read policy is missing.

PGlite is single-session; nothing here is hosted, concurrency or production
evidence. The candidate has not been applied or stamped anywhere. Releasing it
follows `docs/runbooks/reviewed-backend-release.md` and the CLAUDE.md migration
rule: copy the reviewed SQL into a migration named with the stamped ledger
version in the same change that applies it.
