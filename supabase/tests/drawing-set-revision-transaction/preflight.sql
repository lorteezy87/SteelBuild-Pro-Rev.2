-- SELECT ONLY. Run through approved execute_sql with an explicit fixed target.
-- Save the returned catalog inside {projectRef,capture:{transport:'supabase_execute_sql',readOnly:true},catalog}.
-- projectRef is the operator/tool target, NOT a value inferred from current_database().
-- No customer rows, auth rows, object names, credentials, or function bodies are emitted.
WITH app_functions AS (
  SELECT p.*, n.nspname,
    format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) AS identity,
    encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS definition_hash
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  -- Include Auth/Storage guard implementations and their helpers as hashes too.
  WHERE p.prokind IN ('f','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname !~ '^pg_'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass
      AND d.objid=p.oid AND d.deptype='e')
), relations AS (
  SELECT c.*, n.nspname, format('%I.%I', n.nspname, c.relname) AS identity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m') AND ((n.nspname='public' AND c.relname IN (
    'drawings','drawing_sets','drawing_revisions','drawing_markups','drawing_holds','drawing_zones',
    'drawing_links','drawing_zone_dependencies','drawing_signoffs','submittals','submittal_rounds',
    'submittal_round_revision_evidence','drawing_revision_summaries','drawing_revision_impacts'))
    OR n.nspname='steelbuild_drawing_revision'
    OR (n.nspname='storage' AND c.relname='objects'))
), api_roles AS (
  SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')
), table_rows AS (
  SELECT jsonb_build_object('identity',c.identity,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
    'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,
    'acl',coalesce((SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC'
      ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable))
      FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb),
    'privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
      'insert',has_table_privilege(r.oid,c.oid,'INSERT'),'update',has_table_privilege(r.oid,c.oid,'UPDATE'),
      'delete',has_table_privilege(r.oid,c.oid,'DELETE'),'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE'),
      'trigger',has_table_privilege(r.oid,c.oid,'TRIGGER'),'references',has_table_privilege(r.oid,c.oid,'REFERENCES'))
      ORDER BY r.rolname) FROM api_roles r)) AS row
  FROM relations c WHERE c.relkind IN ('r','p') ORDER BY c.identity
), column_rows AS (
  SELECT jsonb_build_object('table',c.identity,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,
    'acl',coalesce((SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC'
      ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable))
      FROM aclexplode(a.attacl) x),'[]'::jsonb),
    'privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
      'insert',has_column_privilege(r.oid,c.oid,a.attnum,'INSERT'),
      'update',has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE'),
      'references',has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES')) ORDER BY r.rolname) FROM api_roles r)) AS row
  FROM relations c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum ORDER BY c.identity,a.attnum
), function_rows AS (
  SELECT jsonb_build_object('identity',p.identity,'schema',p.nspname,'name',p.proname,
    'definitionHash',p.definition_hash,'securityDefiner',p.prosecdef,'volatility',p.provolatile,
    'returns',pg_get_function_result(p.oid),'owner',pg_get_userbyid(p.proowner),'language',l.lanname,
    'config',ARRAY(SELECT v FROM unnest(p.proconfig) v WHERE v ~ '^(search_path|statement_timeout|lock_timeout)='),
    'sourceMentionsProtected',p.prosrc ~* '(drawings|drawing_sets|drawing_revisions|source_observations|submittal_round_revision_evidence)',
    'hasMutationTokens',p.prosrc ~* '\m(insert|update|delete|truncate|execute|alter)\M',
    'dynamicSql',p.prosrc ~* '\mexecute\M',
    -- Deliberately over-inclusive lexical call graph. PL/pgSQL dependencies are not complete in pg_depend.
    -- Dynamic/quoted/extension dispatch still needs human source review; a hash is not a safety proof.
    'calls',coalesce((SELECT jsonb_agg(q.identity ORDER BY q.identity) FROM app_functions q
      WHERE q.oid<>p.oid AND strpos(p.prosrc,q.proname)>0),'[]'::jsonb),
    'acl',coalesce((SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC'
      ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable))
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb),
    'privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
      'execute',has_function_privilege(r.oid,p.oid,'EXECUTE'),
      'schemaUsage',has_schema_privilege(r.oid,p.pronamespace,'USAGE')) ORDER BY r.rolname) FROM api_roles r)) AS row
  FROM app_functions p JOIN pg_language l ON l.oid=p.prolang ORDER BY p.identity
), policy_rows AS (
  SELECT jsonb_build_object('identity',c.identity||'.'||p.polname,'table',c.identity,'name',p.polname,
    'permissive',p.polpermissive,'command',p.polcmd,
    'roles',(SELECT jsonb_agg(CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END)
      FROM unnest(p.polroles) AS role_oid),
    'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid),
    'definitionHash',encode(sha256(convert_to(concat_ws('|',p.polname,p.polcmd,p.polpermissive,
      p.polroles::text,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)),'UTF8')),'hex')) AS row
  FROM pg_policy p JOIN relations c ON c.oid=p.polrelid ORDER BY c.identity,p.polname
), trigger_rows AS (
  SELECT jsonb_build_object('identity',c.identity||'.'||t.tgname,'table',c.identity,'name',t.tgname,
    'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),
    'function',format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)),
    'definitionHash',encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex')) AS row
  FROM pg_trigger t JOIN relations c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE NOT t.tgisinternal ORDER BY c.identity,t.tgname
), constraint_rows AS (
  SELECT jsonb_build_object('identity',c.identity||'.'||k.conname,'table',c.identity,'type',k.contype,
    'validated',k.convalidated,'definition',pg_get_constraintdef(k.oid),
    'definitionHash',encode(sha256(convert_to(pg_get_constraintdef(k.oid),'UTF8')),'hex')) AS row
  FROM pg_constraint k JOIN relations c ON c.oid=k.conrelid ORDER BY c.identity,k.conname
), index_rows AS (
  SELECT jsonb_build_object('identity',c.identity||'.'||i.relname,'table',c.identity,
    'valid',x.indisvalid,'ready',x.indisready,'unique',x.indisunique,'definition',pg_get_indexdef(x.indexrelid),
    'definitionHash',encode(sha256(convert_to(pg_get_indexdef(x.indexrelid),'UTF8')),'hex')) AS row
  FROM pg_index x JOIN relations c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
  ORDER BY c.identity,i.relname
), catalog AS (
  SELECT jsonb_build_object('schemaVersion',1,'capturedAt',clock_timestamp(),'database',current_database(),
    'serverVersion',current_setting('server_version'),
    'tables',coalesce((SELECT jsonb_agg(row) FROM table_rows),'[]'::jsonb),
    'columns',coalesce((SELECT jsonb_agg(row) FROM column_rows),'[]'::jsonb),
    'functions',coalesce((SELECT jsonb_agg(row) FROM function_rows),'[]'::jsonb),
    'policies',coalesce((SELECT jsonb_agg(row) FROM policy_rows),'[]'::jsonb),
    'triggers',coalesce((SELECT jsonb_agg(row) FROM trigger_rows),'[]'::jsonb),
    'constraints',coalesce((SELECT jsonb_agg(row) FROM constraint_rows),'[]'::jsonb),
    'indexes',coalesce((SELECT jsonb_agg(row) FROM index_rows),'[]'::jsonb),
    'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'inherits',rolinherit,'superuser',rolsuper,
      'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,
      'bypassRls',rolbypassrls,'config',ARRAY(SELECT v FROM unnest(rolconfig) v
        WHERE v ~ '^(statement_timeout|lock_timeout|pgrst\.(db_pre_request|db_schemas|db_max_rows))=')) ORDER BY rolname) FROM pg_roles),
    'roleMemberships',coalesce((SELECT jsonb_agg(jsonb_build_object('member',m.rolname,'role',r.rolname,
      'inherit',a.inherit_option,'set',a.set_option) ORDER BY m.rolname,r.rolname)
      FROM pg_auth_members a JOIN pg_roles m ON m.oid=a.member JOIN pg_roles r ON r.oid=a.roleid),'[]'::jsonb),
    'schemas',(SELECT jsonb_agg(jsonb_build_object('identity',nspname,'owner',pg_get_userbyid(nspowner),
      'acl',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema'),
    'defaultPrivileges',coalesce((SELECT jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),
      'schema',n.nspname,'kind',d.defaclobjtype,'acl',d.defaclacl::text) ORDER BY d.oid)
      FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace),'[]'::jsonb),
    'settings',coalesce((SELECT jsonb_agg(jsonb_build_object('database',d.datname,'role',r.rolname,'config',
      ARRAY(SELECT v FROM unnest(s.setconfig) v WHERE v ~ '^(statement_timeout|lock_timeout|pgrst\.(db_pre_request|db_schemas|db_max_rows))=')))
      FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase LEFT JOIN pg_roles r ON r.oid=s.setrole),'[]'::jsonb),
    'views',coalesce((SELECT jsonb_agg(jsonb_build_object('identity',format('%I.%I',n.nspname,c.relname),
      'owner',pg_get_userbyid(c.relowner),'options',c.reloptions,'acl',c.relacl::text,
      'definitionHash',encode(sha256(convert_to(pg_get_viewdef(c.oid),'UTF8')),'hex')) ORDER BY n.nspname,c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m')
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
      AND pg_get_viewdef(c.oid) ~* '(drawings|drawing_sets|drawing_revisions|source_observations)'), '[]'::jsonb)
  ) AS value
)
SELECT value || jsonb_build_object('counts',(SELECT jsonb_object_agg(key,jsonb_array_length(entry))
  FROM jsonb_each(value) AS fields(key,entry) WHERE jsonb_typeof(entry)='array')) AS catalog FROM catalog;
