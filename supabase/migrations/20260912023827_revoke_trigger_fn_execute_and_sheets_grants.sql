-- Supabase advisor hardening, part 2 of 2: trigger-function EXECUTE lockdown and
-- removal of the stray sheets_* table grants.
--
-- Part 1 (pinning search_path on the eight pure SQL helpers) is already in the
-- repo as 20260911062832_pin_workflow_helper_search_paths.sql and is deliberately
-- NOT repeated here. That file additionally pins each body by SHA-256, which is a
-- stronger guard than a bare ALTER; nothing about it needs supplementing.
--
-- Source: Supabase advisors against project kjrwqagyeswwoxpjkcko, verified
-- 2026-09-10 and re-verified against live catalogs 2026-09-12. Two lints:
--   anon_security_definer_function_executable  (5 findings, all public)
--   rls_enabled_no_policy                      (7 findings; the 3 sheets_* here)
--
-- This migration changes function EXECUTE ACLs and three table ACLs. It does NOT
-- change a function body, table, column, trigger, or row of data, and it creates
-- NO RLS policy — so it cannot introduce an auth_rls_initplan violation and it
-- cannot regress the fab-release gate.
--
-- Precedent: 20260805030100_revoke_trigger_fn_execute_and_search_path.sql did
-- exactly this for public.sync_drawing_set_counts. That function is the live
-- proof the pattern is safe — it carries anon_exec = false today and its trigger
-- has kept firing since.

-- ── WHY: anon_security_definer_function_executable (the 5) ───────────────────
--
-- Severity, stated correctly. All 5 are SECURITY DEFINER and all 5 RETURN
-- trigger. Postgres refuses a direct call to a trigger-returning function with
-- SQLSTATE 0A000 at PL/pgSQL compile time, before the body runs, so PostgREST
-- cannot invoke them via /rest/v1/rpc/<name> no matter who holds EXECUTE. The
-- grant is real; the reachability is nil. This is grant hygiene, not a live
-- anon-exploitable surface, and it should not be written up as one.
--
-- Revoking is still correct: trigger execution does not consult EXECUTE on the
-- trigger function, so removing the grant cannot stop any trigger from firing.
-- Each is bound to exactly one trigger, all verified present on 2026-09-12:
--   enforce_signoff_void_rules          -> public.drawing_signoffs
--   log_submittal_activity              -> public.submittals
--   piece_station_completion_refresh_wp -> public.piece_station_completions
--   pieces_projection_after_change      -> public.pieces
--   sync_gc_drawing_set_counts          -> public.gc_drawings
--
-- No client call sites: a search of src/ across ts/tsx/js/jsx for all five names
-- returns zero hits, and none is referenced by an edge function.
--
-- All five already carry SET search_path TO 'public' (proconfig verified live),
-- so no search_path change belongs here — that would be a literal no-op.

-- ── WHY: the sheets_* grants ─────────────────────────────────────────────────
--
-- sheets_config / sheets_doc / sheets_doc_backup have RLS ENABLED WITH ZERO
-- POLICIES, which is fail-closed and correct. The defect is that they also carry
-- direct anon/authenticated table grants, so RLS is the single thing holding them
-- shut. Stripping the grants restores defence in depth.
--
-- service_role is deliberately NOT revoked: the sheets-api edge function is the
-- legitimate caller and reaches these tables through it. Note that function's
-- source lives in the steelbuild-sheets-web project, not this repo — it is one of
-- seven edge functions deployed to this Supabase project with no source here.
--
-- The COMMENTs below exist so the next reader does not "fix" the advisor by
-- adding a policy, which would widen access rather than close it.

-- ── Safety ───────────────────────────────────────────────────────────────────
--
-- Every statement is guarded by to_regprocedure()/to_regclass() and degrades to
-- RAISE NOTICE when an object is absent. That is not defensive padding: the repo
-- is a strict subset of live (11 tables and 177 functions exist in production
-- with no migration here), so a Rev 2-only replay legitimately will not have all
-- of these. Unguarded, such a replay would abort.
--
-- Idempotent and safe to re-run: REVOKE and COMMENT are both idempotent.
--
-- Apply with `supabase db push`. Do NOT apply through MCP apply_migration — that
-- path stamps its own version and is the mechanism by which 45 remote-only
-- versions accumulated in this project's ledger.

BEGIN;

-- ─── anon_security_definer_function_executable: deny the 5 trigger fns ───────
-- PUBLIC is the grantee that matters; anon holds no direct grant of its own.

DO $$
DECLARE
  v_identity text;
BEGIN
  FOREACH v_identity IN ARRAY ARRAY[
    'public.enforce_signoff_void_rules()',
    'public.log_submittal_activity()',
    'public.piece_station_completion_refresh_wp()',
    'public.pieces_projection_after_change()',
    'public.sync_gc_drawing_set_counts()'
  ]
  LOOP
    IF to_regprocedure(v_identity) IS NULL THEN
      RAISE NOTICE 'skip (absent, repo/live drift): revoke execute on %', v_identity;
    ELSE
      EXECUTE format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        v_identity);
    END IF;
  END LOOP;
END $$;

-- ─── rls_enabled_no_policy: strip the sheets_* API-role grants ───────────────
-- service_role is NOT revoked — sheets-api is the legitimate caller.
-- anon is named defensively; it holds nothing on these tables today.

DO $$
BEGIN
  IF to_regclass('public.sheets_config') IS NULL THEN
    RAISE NOTICE 'skip (absent, repo/live drift): public.sheets_config';
  ELSE
    REVOKE ALL ON TABLE public.sheets_config FROM anon, authenticated;
    COMMENT ON TABLE public.sheets_config IS
      'SteelBuild Sheets passcode (PBKDF2-SHA256 hash + salt). Read and written only by the sheets-api edge function via the service role; that function''s source of truth is the steelbuild-sheets-web repo, not this one. RLS is intentionally ENABLED WITH ZERO POLICIES - that is the fail-closed guard, not a defect. Do NOT add a policy to silence the rls_enabled_no_policy advisor.';
  END IF;

  IF to_regclass('public.sheets_doc') IS NULL THEN
    RAISE NOTICE 'skip (absent, repo/live drift): public.sheets_doc';
  ELSE
    REVOKE ALL ON TABLE public.sheets_doc FROM anon, authenticated;
    COMMENT ON TABLE public.sheets_doc IS
      'SteelBuild Sheets live document (single row id=''main''; compare-and-swap on rev, enforced in the edge function, not in this table). Read and written only by the sheets-api edge function via the service role; source of truth is the steelbuild-sheets-web repo. RLS is intentionally ENABLED WITH ZERO POLICIES - fail-closed by design. Do NOT add a policy to silence the rls_enabled_no_policy advisor.';
  END IF;

  IF to_regclass('public.sheets_doc_backup') IS NULL THEN
    RAISE NOTICE 'skip (absent, repo/live drift): public.sheets_doc_backup';
  ELSE
    REVOKE ALL ON TABLE public.sheets_doc_backup FROM anon, authenticated;
    COMMENT ON TABLE public.sheets_doc_backup IS
      'One-off manual snapshot of public.sheets_doc taken before the sheets-api v3 deploy (phantom-save fix), 2026-09-02, at rev 33. Read by nothing. Intentionally has no primary key - it is a point-in-time snapshot, so the performance advisor''s no-PK finding is expected and should not be "fixed". RLS is intentionally ENABLED WITH ZERO POLICIES.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- NOT APPLIED — open decisions this migration deliberately leaves alone.
-- =============================================================================
--
-- 1. Grant drift inside the eight helpers hardened by 20260911062832.
--    risk_transition_allowed, submittal_bic_class and
--    submittal_ofs_checklist_complete carry PUBLIC EXECUTE while their five
--    siblings do not (verified live 2026-09-12). Harmless today — all are
--    SECURITY INVOKER, pure over their arguments, and touch no table — but
--    inconsistent. If revoked, revoke FROM PUBLIC only: authenticated must keep
--    EXECUTE or the fab-release gate breaks.
--
-- 2. public.billing_config. Untouched here on two independent grounds. Policy:
--    CLAUDE.md bars billing changes while the S&H Steel employment/IP conflict is
--    unresolved. Technical: it has no anon/authenticated grant at all and RLS with
--    no policy, so it is doubly fail-closed and there is nothing to fix. Separately
--    worth an owner's attention: it stores stripe_webhook_secret in a plaintext
--    text column alongside a livemode flag, rather than in Vault.
--
-- 3. private.desktop_session_handoffs, private.maintenance_jobs. Schema private
--    grants USAGE to no role and relacl is NULL. A policy there is unreachable
--    dead code.
--
-- 4. public.planner_offline_operation_receipts. relacl is NULL; it is an RPC-only
--    door carrying its own authorization.
--
-- 5. The planner_action_events replay breaker.
--    20260908150000_schedule_change_log_completeness.sql:183-184 creates an index
--    on a table no migration in this repo creates, so `supabase db reset` aborts
--    there. Fix by backfilling the table's lineage from live, not by deleting the
--    index.
--
-- 6. The 45 remote-only migration versions, 11 untracked tables and 177 untracked
--    functions. The repo is a strict subset of live (repo_not_live = 0), so this is
--    a capture problem, not a reconciliation one. Sequence matters: capture first,
--    then `supabase migration repair` the 31 orphaned stamps — never the reverse.
--
-- 7. Seven edge functions deployed with no source in this repo: schedule-assistant,
--    sharepoint-proxy, bluebeam-proxy, stripe-setup, stripe-webhook, stripe-worker,
--    sheets-api. Four run with verify_jwt = false. A schema-only dump does not
--    capture these; they need `supabase functions download`.
--
-- 8. Two bare auth.uid() policies on storage.objects — the only auth_rls_initplan
--    violations in the database. Public-schema policies are clean.
--
-- 9. The supabase-drift CI job cannot execute: .github/workflows/ci.yml:230 runs
--    `npm run supabase:drift`, which is not a script in package.json. This is the
--    job whose stated purpose is catching exactly the drift documented above.
