-- Revoke link_unlinked_model_elements_for_piece from authenticated, and check
-- that the revoke actually took.
--
-- The function is SECURITY DEFINER (search_path = public) and checks neither
-- auth.uid() nor project access. It reads the project from whatever piece id it
-- is given, so any signed-in user could POST
-- /rpc/link_unlinked_model_elements_for_piece with a piece from another org's
-- project. That relinks the project's unmatched model_elements to the piece and
-- overwrites their work_package_id and fab_status.
--
-- 20260801120000 created it with REVOKE ... FROM PUBLIC, anon. Supabase's
-- default privileges grant EXECUTE on new public functions to authenticated
-- directly, not through PUBLIC, so that left it callable. 20260914010000
-- revokes authenticated as well, but a read-only check of production on
-- 2026-09-14 still showed {postgres=X, authenticated=X, service_role=X}. This
-- file states the revoke again and verifies the result, so its ledger row
-- means the privilege is really gone.
--
-- Nothing else needs EXECUTE. The only caller is
-- pieces_projection_after_change(), fired by trg_pieces_projection_after_change
-- on public.pieces. That trigger function is SECURITY DEFINER and owned by
-- postgres, so its call runs as postgres whoever wrote the piece. No code in
-- src/ or supabase/functions/ calls the RPC. service_role keeps the explicit
-- grant from 20260801120000.
--
-- Safe to re-run: REVOKE is idempotent.

REVOKE EXECUTE ON FUNCTION public.link_unlinked_model_elements_for_piece(uuid) FROM PUBLIC, anon, authenticated;

-- REVOKE only removes grants made by the role it acts as, and it succeeds even
-- when it removes nothing. A grant from another grantor, or one inherited
-- through a role membership, would survive it, so check the effective
-- privilege rather than trusting the statement.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.link_unlinked_model_elements_for_piece(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.link_unlinked_model_elements_for_piece(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'link_unlinked_model_elements_for_piece is still executable by anon or authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.link_unlinked_model_elements_for_piece(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'link_unlinked_model_elements_for_piece has lost its service_role grant';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
