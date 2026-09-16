-- Revoke authenticated EXECUTE on public.erase_my_account(text).
--
-- Discovered while deploying the account-delete edge function: this project
-- also carries a second, independent self-service account-deletion RPC,
-- reachable directly by any signed-in user at /rest/v1/rpc/erase_my_account.
-- It is NOT called anywhere in this repo's src/ or supabase/functions/, and
-- (like feature_flag_enabled_for, its only caller) it is not created by any
-- migration here — production-only, most likely a leftover from the sibling
-- SteelBuild-Pro-2026 app sharing this database. Revoked on the owner's
-- explicit instruction, not on a guess about the sibling app's needs.
--
-- Guarded with to_regprocedure, same as 20260914020000: this function does
-- not exist on a fresh/local database, and a bare REVOKE would abort replay
-- there with "function ... does not exist".
--
-- service_role and the function owner (postgres) are untouched — the revoke
-- only removes public/anon/authenticated. Supabase's ALTER DEFAULT PRIVILEGES
-- grants EXECUTE directly to authenticated (not just PUBLIC), so the revoke
-- must name it explicitly or the function stays callable by anyone with a
-- session — the same defect 20260914020000 documents for its own targets.
do $$
begin
  if to_regprocedure('public.erase_my_account(text)') is not null then
    execute 'revoke execute on function public.erase_my_account(text) from public, anon, authenticated';
  else
    raise notice 'skipping revoke, function not present here: public.erase_my_account(text)';
  end if;
end $$;
