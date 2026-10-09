-- READ ONLY. Must return zero rows after reviewed application and before release.
-- External PostgREST environment/config overrides still need an HTTP smoke test.
SELECT 'missing MFA request hook on authenticator' AS gap
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_db_role_setting s
  WHERE s.setrole = 'authenticator'::regrole
    AND s.setdatabase IN (0, (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()))
    AND s.setconfig @> ARRAY['pgrst.db_pre_request=steelbuild_security.check_request_mfa']
)
OR EXISTS (
  SELECT 1 FROM pg_catalog.pg_db_role_setting s, unnest(s.setconfig) setting
  WHERE s.setrole IN (0, 'authenticator'::regrole)
    AND s.setdatabase IN (0, (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()))
    AND setting LIKE 'pgrst.db_pre_request=%'
    AND setting <> 'pgrst.db_pre_request=steelbuild_security.check_request_mfa'
)
UNION ALL
SELECT format('missing restrictive MFA policy: %I.%I', target.schemaname, target.tablename)
FROM (
  SELECT schemaname, tablename FROM pg_catalog.pg_publication_tables WHERE pubname='supabase_realtime'
  UNION SELECT 'storage', 'objects'
) target
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_policies policy
  JOIN pg_catalog.pg_namespace n ON n.nspname=policy.schemaname
  JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=policy.tablename
  WHERE policy.schemaname=target.schemaname AND policy.tablename=target.tablename
    AND policy.policyname='require_enrolled_mfa' AND policy.permissive='RESTRICTIVE'
    AND policy.cmd='ALL' AND policy.roles = ARRAY['authenticated']::name[]
    AND c.relrowsecurity
    AND regexp_replace(policy.qual, '\s+', '', 'g') = '(SELECTsteelbuild_security.satisfies_mfa()ASsatisfies_mfa)'
    AND regexp_replace(policy.with_check, '\s+', '', 'g') = '(SELECTsteelbuild_security.satisfies_mfa()ASsatisfies_mfa)'
);
