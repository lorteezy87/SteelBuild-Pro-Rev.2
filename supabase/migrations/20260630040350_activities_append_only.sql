-- Make the activities audit trail append-only (tamper-evident), matching
-- fab_release_log / ai_audit_log / backcharge_events (INSERT+SELECT only).
-- Previously any project member (incl. viewer) could UPDATE or DELETE activity
-- rows via the project_update / project_delete policies (gated only by
-- user_has_project_access with no role floor), letting the audit history be
-- silently rewritten or erased — e.g. covering up who released fab. Nothing in
-- the app mutates activities (auditLogger only INSERTs), so dropping the
-- write-after-insert policies is behavior-safe.
--
-- Applied live to prod (kjrwqagyeswwoxpjkcko) via apply_migration on 2026-06-30;
-- this file records that change for repo<->schema_migrations lockstep.
drop policy if exists project_update on public.activities;
drop policy if exists project_delete on public.activities;
