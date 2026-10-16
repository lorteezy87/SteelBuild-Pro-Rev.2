-- MANUAL, PRIVATE, SYNTHETIC STAGING ONLY. Not a migration, RPC or workflow step.
-- Before use: independently verify the staging connection and operator identity,
-- exact reviewed source/artifact provenance, validateSetupPlan/validateFoundationReceipt,
-- installed compatible package, full side-effect/no-email/async closure and readiness.
-- Decryption, a digest or these GUCs do not authenticate that evidence or the database.
-- The operator starts an explicit READ COMMITTED transaction, supplies LOCAL settings
-- drawing_setup.plan / receipt / side_effects (exact reviewed compact JSON bytes),
-- plan_sha256 / receipt_sha256 / candidate_sha / catalog_sha256 /
-- installed_closure_sha256 / observation_sha256, and executes this exact file.
-- Review the private readback, then explicitly COMMIT or ROLLBACK outside this file.
-- A lost COMMIT response requires separate reconciliation; never blindly rerun.
-- The catalog query below is also the read-only pre-review fingerprint query. Its
-- result is approved independently, not calculated-and-trusted at execution time.
-- The fixed child map includes the installed drawing package's adopted_sources.
-- Missing/extra/unknown schema is a stop, not authority to install or sweep it.

DO $operator$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres'
    OR current_setting('session_replication_role') <> 'origin'
    OR coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}') <> '{}'
    OR coalesce(current_setting('request.jwt.claim.sub',true),'') <> ''
    OR coalesce(current_setting('request.jwt.claim.role',true),'') <> '' THEN
    RAISE EXCEPTION 'DRAWING_SETUP_OPERATOR_REQUIRED';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'DRAWING_SETUP_READ_COMMITTED_REQUIRED';
  END IF;
END
$operator$;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '8s';
-- Top-level LOCK requires an explicit operator transaction. Alphabetical order,
-- NOWAIT, and SHARE ROW EXCLUSIVE exclude concurrent child inserts and org writes.
LOCK TABLE private.billing_checkout_intents, private.stripe_billing_sync_state,
  public.account_deletions, public.billing_events, public.client_events,
  public.data_erasure_log, public.note_folder_audit_events, public.note_folder_migrations,
  public.note_folder_mutation_receipts, public.note_folders, public.organization_invitations,
  public.organization_members, public.organizations, public.projects, public.vendors,
  steelbuild_drawing_revision.adopted_sources IN SHARE ROW EXCLUSIVE MODE NOWAIT;

DO $entitlements$
DECLARE
  plan_text text := current_setting('drawing_setup.plan',true);
  receipt_text text := current_setting('drawing_setup.receipt',true);
  effects_text text := current_setting('drawing_setup.side_effects',true);
  p jsonb; r jsonb; effects jsonb; x jsonb; y jsonb; org jsonb; owner_actor jsonb; member jsonb;
  shape record; binding record; v_catalog text; aliases text[] := ARRAY['pm','viewer','field','admin','foreign','removed','mfa'];
  org_ids uuid[]; v_org_id uuid; before_orgs jsonb; after_orgs jsonb; before_children jsonb; after_children jsonb;
  i integer; touched integer := 0; affected integer; expected_action text; expected_actor text; expected_id text;
  v_observed_at timestamptz; v_created_at timestamptz; v_expires_at timestamptz;
  allowed_org_relations text[] := ARRAY['private.billing_checkout_intents','private.stripe_billing_sync_state',
    'public.account_deletions','public.billing_events','public.client_events','public.data_erasure_log',
    'public.note_folder_audit_events','public.note_folder_migrations','public.note_folder_mutation_receipts',
    'public.note_folders','public.organization_invitations','public.organization_members','public.projects','public.vendors',
    'steelbuild_drawing_revision.adopted_sources'];
BEGIN
  FOR binding IN SELECT * FROM (VALUES
    (plan_text,current_setting('drawing_setup.plan_sha256',true)),
    (receipt_text,current_setting('drawing_setup.receipt_sha256',true))) AS b(raw,expected)
  LOOP
    IF coalesce(octet_length(binding.raw),0) NOT BETWEEN 2 AND 1048576
      OR binding.expected IS NULL OR binding.expected !~ '^[a-f0-9]{64}$'
      OR encode(sha256(convert_to(binding.raw,'UTF8')),'hex') <> binding.expected
      OR NOT (binding.raw IS JSON OBJECT WITH UNIQUE KEYS) THEN
      RAISE EXCEPTION 'DRAWING_SETUP_REVIEW_BINDING';
    END IF;
  END LOOP;
  p := plan_text::jsonb; r := receipt_text::jsonb;
  IF effects_text IS NULL OR octet_length(effects_text)>1048576 OR NOT (effects_text IS JSON OBJECT WITH UNIQUE KEYS) THEN
    RAISE EXCEPTION 'DRAWING_SETUP_SIDE_EFFECTS_REQUIRED'; END IF;
  effects := effects_text::jsonb;
  -- Exact bootstrap subset of the shared strict types; no credentials, MFA,
  -- optional complete-phase fields, arbitrary SQL or extra object keys accepted.
  FOR shape IN SELECT * FROM (VALUES
    (p,ARRAY['context','createdAt','expiresAt','roster','organizations','projects','keyReview','prerequisites','prerequisiteDetails']),
    (p->'context',ARRAY['version','projectRef','candidateSha','runId','workflowRunId','workflowRunAttempt','phase','checkpointSequence','recipientSha256']),
    (r,ARRAY['context','planSha256','status','operations','actors','organizations','projects','memberships','census']),
    (r->'context',ARRAY['version','projectRef','candidateSha','runId','workflowRunId','workflowRunAttempt','phase','checkpointSequence','recipientSha256']),
    (p->'keyReview',ARRAY['publicKeySha256','setupKeySha256','setupKeyIdentifier','ownerAttestationSha256']),
    (p->'prerequisites',ARRAY['scenarioSourceSha256','sourceJobsSha256','immutableBuildSha256','packageSha256','ownershipSha256','sideEffectsSha256','healthSha256','noEmailSha256','settingsAuthoritySha256']),
    (p->'prerequisiteDetails',ARRAY['sideEffects']),
    (effects,ARRAY['version','projectRef','candidateSha','reviewedAt','expiresAt','installedClosureSha256','activeCostCodeTemplates','seedSemantics']),
    (r->'census',ARRAY['observedAt','sideEffectsSha256','observationSha256','children'])) AS s(value,keys)
  LOOP
    IF jsonb_typeof(shape.value) IS DISTINCT FROM 'object' OR
      (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(shape.value) k) IS DISTINCT FROM
      (SELECT array_agg(k ORDER BY k) FROM unnest(shape.keys) k) THEN
      RAISE EXCEPTION 'DRAWING_SETUP_STRICT_SHAPE'; END IF;
  END LOOP;
  FOR x IN
    SELECT value FROM jsonb_each((p->'context')-ARRAY['version','checkpointSequence']) UNION ALL
    SELECT value FROM jsonb_each((r->'context')-ARRAY['version','checkpointSequence']) UNION ALL
    SELECT value FROM jsonb_each(p->'keyReview') UNION ALL
    SELECT value FROM jsonb_each(p->'prerequisites') UNION ALL
    SELECT value FROM jsonb_each(effects-ARRAY['version','activeCostCodeTemplates']) UNION ALL
    SELECT value FROM jsonb_each((r->'census')-'children') UNION ALL
    SELECT p->'createdAt' UNION ALL SELECT p->'expiresAt' UNION ALL SELECT r->'status' UNION ALL SELECT r->'planSha256'
  LOOP
    IF jsonb_typeof(x) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'DRAWING_SETUP_SCALAR_TYPE'; END IF;
  END LOOP;
  FOR x IN SELECT p->'createdAt' UNION ALL SELECT p->'expiresAt' UNION ALL SELECT effects->'reviewedAt'
    UNION ALL SELECT effects->'expiresAt' UNION ALL SELECT r#>'{census,observedAt}' LOOP
    IF x#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?Z$' THEN
      RAISE EXCEPTION 'DRAWING_SETUP_TIMESTAMP_FORMAT'; END IF;
  END LOOP;
  IF length(p#>>'{keyReview,setupKeyIdentifier}') NOT BETWEEN 1 AND 100
    OR p#>>'{keyReview,setupKeyIdentifier}' !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$' THEN
    RAISE EXCEPTION 'DRAWING_SETUP_KEY_IDENTIFIER'; END IF;
  IF (p#>'{context,version}') IS DISTINCT FROM '1'::jsonb OR p#>>'{context,projectRef}' <> 'ndyfjffsulfbwpmwdmic'
    OR p#>>'{context,phase}' <> 'setup-bootstrap' OR p#>'{context,checkpointSequence}' <> '0'::jsonb
    OR p#>>'{context,candidateSha}' !~ '^[a-f0-9]{40}$'
    OR p#>>'{context,candidateSha}' IS DISTINCT FROM current_setting('drawing_setup.candidate_sha',true)
    OR p#>>'{context,recipientSha256}' !~ '^[a-f0-9]{64}$'
    OR p#>>'{context,runId}' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    OR p#>>'{context,workflowRunId}' !~ '^[1-9][0-9]{0,19}$' OR p#>>'{context,workflowRunAttempt}' !~ '^[1-9][0-9]{0,19}$'
    OR (r->'context')-'checkpointSequence' IS DISTINCT FROM (p->'context')-'checkpointSequence'
    OR r#>'{context,checkpointSequence}' IS DISTINCT FROM '32'::jsonb
    OR r->>'planSha256' IS DISTINCT FROM current_setting('drawing_setup.plan_sha256',true)
    OR r->>'status' IS DISTINCT FROM 'AWAITING_ENTITLEMENT_REVIEW' THEN
    RAISE EXCEPTION 'DRAWING_SETUP_SOURCE_OR_RECEIPT';
  END IF;
  v_created_at := (p->>'createdAt')::timestamptz; v_expires_at := (p->>'expiresAt')::timestamptz;
  v_observed_at := (r#>>'{census,observedAt}')::timestamptz;
  IF v_created_at IS NULL OR v_expires_at IS NULL OR v_observed_at IS NULL
    OR NOT (v_created_at <= clock_timestamp() AND clock_timestamp() < v_expires_at AND v_expires_at <= v_created_at + interval '24 hours'
      AND v_created_at <= v_observed_at AND v_observed_at <= clock_timestamp() AND v_observed_at < v_expires_at) THEN
    RAISE EXCEPTION 'DRAWING_SETUP_EXPIRED'; END IF;
  IF effects IS DISTINCT FROM p#>'{prerequisiteDetails,sideEffects}'
    OR encode(sha256(convert_to(effects_text,'UTF8')),'hex') IS DISTINCT FROM p#>>'{prerequisites,sideEffectsSha256}'
    OR r#>>'{census,sideEffectsSha256}' IS DISTINCT FROM p#>>'{prerequisites,sideEffectsSha256}'
    OR effects->>'installedClosureSha256' IS DISTINCT FROM current_setting('drawing_setup.installed_closure_sha256',true)
    OR effects->>'installedClosureSha256' !~ '^[a-f0-9]{64}$'
    OR r#>>'{census,observationSha256}' IS DISTINCT FROM current_setting('drawing_setup.observation_sha256',true)
    OR r#>>'{census,observationSha256}' !~ '^[a-f0-9]{64}$'
    OR effects->'version' IS DISTINCT FROM '1'::jsonb OR effects->>'projectRef' IS DISTINCT FROM 'ndyfjffsulfbwpmwdmic'
    OR effects->>'candidateSha' IS DISTINCT FROM p#>>'{context,candidateSha}'
    OR effects->>'seedSemantics' IS DISTINCT FROM 'stage-foundation-v1'
    OR NOT ((effects->>'reviewedAt')::timestamptz <= v_created_at AND v_expires_at <= (effects->>'expiresAt')::timestamptz
      AND (effects->>'expiresAt')::timestamptz <= (effects->>'reviewedAt')::timestamptz + interval '24 hours') THEN
    RAISE EXCEPTION 'DRAWING_SETUP_SIDE_EFFECTS_BINDING'; END IF;
  FOR x IN SELECT value FROM jsonb_each(p->'prerequisites') UNION ALL
    SELECT value FROM jsonb_each((p->'keyReview')-'setupKeyIdentifier') LOOP
    IF jsonb_typeof(x) <> 'string' OR x#>>'{}' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'DRAWING_SETUP_PREREQUISITES'; END IF;
  END LOOP;
  FOR shape IN SELECT * FROM (VALUES (p->'roster',7),(p->'organizations',2),(p->'projects',4),
    (r->'actors',7),(r->'organizations',2),(r->'projects',0),(r->'memberships',2),(r->'operations',32),
    (r#>'{census,children}',0)) AS s(value,n) LOOP
    IF jsonb_typeof(shape.value) IS DISTINCT FROM 'array' OR jsonb_array_length(shape.value) <> shape.n THEN
      RAISE EXCEPTION 'DRAWING_SETUP_CARDINALITY'; END IF;
  END LOOP;
  FOR shape IN
    SELECT value,ARRAY['alias','email'] keys FROM jsonb_array_elements(p->'roster') UNION ALL
    SELECT value,ARRAY['alias','name','slug'] FROM jsonb_array_elements(p->'organizations') UNION ALL
    SELECT value,ARRAY['alias','organization','name','number'] FROM jsonb_array_elements(p->'projects') UNION ALL
    SELECT value,ARRAY['alias','id','emailSha256','authenticated'] FROM jsonb_array_elements(r->'actors') UNION ALL
    SELECT value,ARRAY['alias','id','createdBy','ownerId'] FROM jsonb_array_elements(r->'organizations') UNION ALL
    SELECT value,ARRAY['id','actor','userId','orgId','role'] FROM jsonb_array_elements(r->'memberships')
  LOOP
    IF jsonb_typeof(shape.value) <> 'object' OR
      (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(shape.value) k) IS DISTINCT FROM
      (SELECT array_agg(k ORDER BY k) FROM unnest(shape.keys) k) THEN RAISE EXCEPTION 'DRAWING_SETUP_STRICT_IDENTITY'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(shape.value) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM
      CASE e.key WHEN 'authenticated' THEN 'boolean' ELSE 'string' END) THEN
      RAISE EXCEPTION 'DRAWING_SETUP_IDENTITY_TYPE'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'alias') FROM jsonb_array_elements(r->'actors')) <> 7
    OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(r->'actors')) <> 7
    OR (SELECT count(DISTINCT value->>'alias') FROM jsonb_array_elements(p->'roster')) <> 7
    OR (SELECT count(DISTINCT lower(value->>'email')) FROM jsonb_array_elements(p->'roster')) <> 7
    OR (SELECT count(DISTINCT value->>'alias') FROM jsonb_array_elements(r->'organizations')) <> 2
    OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(r->'organizations')) <> 2
    OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(r->'memberships')) <> 2
    OR (SELECT count(DISTINCT value->>'alias') FROM jsonb_array_elements(p->'organizations')) <> 2
    OR (SELECT count(DISTINCT lower(value->>'name')) FROM jsonb_array_elements(p->'organizations')) <> 2
    OR (SELECT count(DISTINCT value->>'slug') FROM jsonb_array_elements(p->'organizations')) <> 2 THEN
    RAISE EXCEPTION 'DRAWING_SETUP_DUPLICATE_IDENTITY'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(r->'actors') LOOP
    SELECT value INTO y FROM jsonb_array_elements(p->'roster') WHERE value->>'alias'=x->>'alias';
    IF NOT (x->>'alias'=ANY(aliases)) OR x->'authenticated' IS DISTINCT FROM 'true'::jsonb
      OR x->>'emailSha256' IS DISTINCT FROM encode(sha256(convert_to(lower(y->>'email'),'UTF8')),'hex')
      OR length(y->>'email') NOT BETWEEN 3 AND 254 OR y->>'email' !~ '^[^ @]+@[^ @]+[.][^ @]+$' THEN
      RAISE EXCEPTION 'DRAWING_SETUP_ACTOR_BINDING'; END IF;
    PERFORM (x->>'id')::uuid;
  END LOOP;
  FOR x IN SELECT value FROM jsonb_array_elements(p->'organizations') LOOP
    IF x->>'alias' NOT IN ('A','B') OR length(x->>'name') NOT BETWEEN 1 AND 100
      OR x->>'name' !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$' OR length(x->>'slug') NOT BETWEEN 1 AND 63
      OR x->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'DRAWING_SETUP_ORGANIZATION_DESCRIPTION'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'alias') FROM jsonb_array_elements(p->'projects')) <> 4
    OR (SELECT count(DISTINCT lower(value->>'name')) FROM jsonb_array_elements(p->'projects')) <> 4
    OR (SELECT count(DISTINCT lower(value->>'number')) FROM jsonb_array_elements(p->'projects')) <> 4 THEN
    RAISE EXCEPTION 'DRAWING_SETUP_PROJECT_DESCRIPTIONS'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p->'projects') LOOP
    IF x->>'alias' NOT IN ('A1','A2','B1','B2') OR x->>'organization' <> left(x->>'alias',1)
      OR length(x->>'name') NOT BETWEEN 1 AND 100 OR x->>'name' !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$'
      OR length(x->>'number') NOT BETWEEN 1 AND 100 OR x->>'number' !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$' THEN
      RAISE EXCEPTION 'DRAWING_SETUP_PROJECT_DESCRIPTIONS'; END IF;
  END LOOP;
  IF jsonb_typeof(effects->'activeCostCodeTemplates') IS DISTINCT FROM 'array' OR jsonb_array_length(effects->'activeCostCodeTemplates')>256 THEN
    RAISE EXCEPTION 'DRAWING_SETUP_TEMPLATE_SHAPE'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(effects->'activeCostCodeTemplates') LOOP
    -- Reject non-objects before object iteration, then validate JSON scalar types
    -- before ->> can coerce numbers/booleans or turn JSON null into SQL NULL.
    IF jsonb_typeof(x) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'DRAWING_SETUP_TEMPLATE_SHAPE'; END IF;
    IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k) IS DISTINCT FROM
      ARRAY['category','cost_code_number','default_budget_amount','description','id','is_active','sort_order']::text[] THEN
      RAISE EXCEPTION 'DRAWING_SETUP_TEMPLATE_SHAPE'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(x) e WHERE e.key <> 'default_budget_amount'
      AND jsonb_typeof(e.value) IS DISTINCT FROM CASE e.key
        WHEN 'is_active' THEN 'boolean' WHEN 'sort_order' THEN 'number' ELSE 'string' END)
      OR jsonb_typeof(x->'default_budget_amount') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'DRAWING_SETUP_TEMPLATE_SHAPE'; END IF;
    IF x->'is_active' IS DISTINCT FROM 'true'::jsonb
      OR x->>'id' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      OR length(x->>'cost_code_number') NOT BETWEEN 1 AND 100 OR length(x->>'category') NOT BETWEEN 1 AND 100
      OR length(x->>'description')>500
      OR (x->'default_budget_amount' <> 'null'::jsonb AND (length(x->>'default_budget_amount')>61
        OR x->>'default_budget_amount' !~ '^-?(0|[1-9][0-9]{0,29})([.][0-9]{1,30})?$'))
      OR x->>'sort_order' !~ '^-?[0-9]+$'
      OR (x->>'sort_order')::numeric NOT BETWEEN -2147483648 AND 2147483647 THEN
      RAISE EXCEPTION 'DRAWING_SETUP_TEMPLATE_SHAPE'; END IF;
    PERFORM (x->>'id')::uuid, (x->>'sort_order')::integer;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(effects->'activeCostCodeTemplates')) <> jsonb_array_length(effects->'activeCostCodeTemplates')
    OR (SELECT count(DISTINCT value->>'cost_code_number') FROM jsonb_array_elements(effects->'activeCostCodeTemplates')) <> jsonb_array_length(effects->'activeCostCodeTemplates') THEN
    RAISE EXCEPTION 'DRAWING_SETUP_DUPLICATE_TEMPLATE'; END IF;
  -- Exactly fourteen create/authenticate results, then two organization results.
  IF (SELECT count(DISTINCT value->>'operationId') FROM jsonb_array_elements(r->'operations') WHERE value->>'kind'='intent') <> 16 THEN
    RAISE EXCEPTION 'DRAWING_SETUP_OPERATION_ID'; END IF;
  FOR i IN 0..15 LOOP
    x := r->'operations'->(2*i); y := r->'operations'->(2*i+1);
    IF i<14 THEN
      expected_action := CASE WHEN i%2=0 THEN 'create-user' ELSE 'authenticate-user' END;
      expected_actor := aliases[1+i/2];
      SELECT value->>'id' INTO expected_id FROM jsonb_array_elements(r->'actors') WHERE value->>'alias'=expected_actor;
    ELSE
      expected_action := 'create-organization'; expected_actor := CASE WHEN i=14 THEN 'admin' ELSE 'foreign' END;
      SELECT value->>'id' INTO expected_id FROM jsonb_array_elements(r->'organizations') WHERE value->>'alias'=CASE WHEN i=14 THEN 'A' ELSE 'B' END;
    END IF;
    IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k) IS DISTINCT FROM
      (CASE WHEN i<14 THEN ARRAY['action','actor','kind','operationId','sequence'] ELSE ARRAY['action','actor','kind','operationId','organization','sequence'] END)
      OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(y) k) IS DISTINCT FROM ARRAY['kind','observedId','operationId','outcome','sequence']
      OR x->'sequence' IS DISTINCT FROM to_jsonb(2*i+1) OR y->'sequence' IS DISTINCT FROM to_jsonb(2*i+2)
      OR x->>'kind' IS DISTINCT FROM 'intent' OR y->>'kind' IS DISTINCT FROM 'result'
      OR x->>'action' IS DISTINCT FROM expected_action OR x->>'actor' IS DISTINCT FROM expected_actor
      OR y->>'outcome' IS DISTINCT FROM 'SUCCEEDED' OR y->>'observedId' IS DISTINCT FROM expected_id
      OR x->>'operationId' IS DISTINCT FROM y->>'operationId'
      OR (i>=14 AND x->>'organization' IS DISTINCT FROM CASE WHEN i=14 THEN 'A' ELSE 'B' END) THEN
      RAISE EXCEPTION 'DRAWING_SETUP_OPERATION_BINDING'; END IF;
    PERFORM (x->>'operationId')::uuid;
  END LOOP;

  v_catalog := (
-- CATALOG QUERY START
WITH namespaces AS (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'),
relations AS (SELECT c.oid FROM pg_catalog.pg_class c WHERE c.relnamespace IN (SELECT oid FROM namespaces)),
functions AS (SELECT proc.oid FROM pg_catalog.pg_proc proc WHERE proc.pronamespace IN (SELECT oid FROM namespaces)),
catalog AS (
  SELECT 'namespace' kind,to_jsonb(n) value FROM pg_catalog.pg_namespace n WHERE n.oid IN (SELECT oid FROM namespaces)
  UNION ALL SELECT 'relation',to_jsonb(c)-ARRAY['relpages','reltuples','relallvisible','relallfrozen'] FROM pg_catalog.pg_class c WHERE c.oid IN (SELECT oid FROM relations)
  UNION ALL SELECT 'attribute',to_jsonb(a) FROM pg_catalog.pg_attribute a WHERE a.attrelid IN (SELECT oid FROM relations)
  UNION ALL SELECT 'default',to_jsonb(d) FROM pg_catalog.pg_attrdef d WHERE d.adrelid IN (SELECT oid FROM relations)
  UNION ALL SELECT 'constraint',to_jsonb(c) FROM pg_catalog.pg_constraint c WHERE c.conrelid IN (SELECT oid FROM relations) OR c.confrelid IN (SELECT oid FROM relations)
  UNION ALL SELECT 'index',to_jsonb(idx) FROM pg_catalog.pg_index idx WHERE idx.indrelid IN (SELECT oid FROM relations)
  UNION ALL SELECT 'trigger',to_jsonb(t) FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM relations)
  UNION ALL SELECT 'policy',to_jsonb(pol) FROM pg_catalog.pg_policy pol WHERE pol.polrelid IN (SELECT oid FROM relations)
  UNION ALL SELECT 'rewrite',to_jsonb(rw) FROM pg_catalog.pg_rewrite rw WHERE rw.ev_class IN (SELECT oid FROM relations)
  UNION ALL SELECT 'function',to_jsonb(proc) FROM pg_catalog.pg_proc proc WHERE proc.oid IN (SELECT oid FROM functions)
  UNION ALL SELECT 'dependency',to_jsonb(d) FROM pg_catalog.pg_depend d WHERE (d.classid='pg_catalog.pg_class'::regclass AND d.objid IN (SELECT oid FROM relations)) OR (d.classid='pg_catalog.pg_proc'::regclass AND d.objid IN (SELECT oid FROM functions))
  UNION ALL SELECT 'default_acl',to_jsonb(a) FROM pg_catalog.pg_default_acl a
  UNION ALL SELECT 'role',to_jsonb(role_entry) FROM pg_catalog.pg_roles role_entry
  UNION ALL SELECT 'membership',to_jsonb(m) FROM pg_catalog.pg_auth_members m
  UNION ALL SELECT 'publication',to_jsonb(pub) FROM pg_catalog.pg_publication pub
  UNION ALL SELECT 'publication_relation',to_jsonb(pubrel) FROM pg_catalog.pg_publication_rel pubrel
)
SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(kind,value) ORDER BY kind,value::text),'[]')::text,'UTF8')),'hex') AS digest FROM catalog
-- CATALOG QUERY END
  );
  IF v_catalog IS DISTINCT FROM current_setting('drawing_setup.catalog_sha256',true) THEN
    RAISE EXCEPTION 'DRAWING_SETUP_CATALOG_CHANGED'; END IF;
  IF (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute
    WHERE attrelid='public.organizations'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM
    ARRAY['created_at','created_by','current_period_end','id','member_default_project_role','metadata','name','plan','slug',
      'stripe_customer_id','stripe_subscription_id','subscription_status','updated_at']::text[] THEN
    RAISE EXCEPTION 'DRAWING_SETUP_UNSUPPORTED_ORG_SCHEMA'; END IF;
  -- Catalog equality is a drift check, not an automatic semantic review. Require
  -- the finite source map even if an operator supplies a digest for another map.
  IF (SELECT array_agg(n.nspname||'.'||c.relname ORDER BY n.nspname||'.'||c.relname)
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE a.attname IN ('org_id','organization_id') AND NOT a.attisdropped AND c.relkind IN ('r','p')
        AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema') IS DISTINCT FROM allowed_org_relations
    OR EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE a.attname IN ('org_id','organization_id') AND NOT a.attisdropped AND c.relkind IN ('r','p')
      AND n.nspname NOT LIKE 'pg_%' AND (a.atttypid<>'uuid'::regtype OR c.relkind<>'r'))
    OR (SELECT array_agg(n.nspname||'.'||c.relname ORDER BY n.nspname||'.'||c.relname)
      FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE f.contype='f' AND f.confrelid='public.organizations'::regclass) IS DISTINCT FROM
      array_remove(array_remove(array_remove(allowed_org_relations,'public.account_deletions'),'public.client_events'),'public.data_erasure_log')
    OR EXISTS(SELECT 1 FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE f.contype='f' AND f.confrelid='public.organizations'::regclass AND
       (NOT f.convalidated OR f.condeferrable OR f.condeferred OR NOT (n.nspname||'.'||c.relname=ANY(allowed_org_relations))
        OR f.conkey IS DISTINCT FROM ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.oid AND attname='org_id')]::smallint[]
        OR f.confkey IS DISTINCT FROM ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=f.confrelid AND attname='id')]::smallint[])) THEN
    RAISE EXCEPTION 'DRAWING_SETUP_UNSUPPORTED_ORG_GRAPH'; END IF;
  -- Zero projects only implies zero project descendants for validated immediate
  -- foreign keys. Unknown non-FK project_id columns require a separately reviewed
  -- source extension; do not infer a clean census from an unsupported schema.
  IF EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE a.attname='project_id' AND NOT a.attisdropped AND c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%'
    AND NOT EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=c.oid
      AND f.confrelid='public.projects'::regclass AND f.convalidated AND NOT f.condeferrable AND NOT f.condeferred
      AND f.conkey=ARRAY[a.attnum]::smallint[] AND f.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=f.confrelid AND attname='id')]::smallint[])) THEN
    RAISE EXCEPTION 'DRAWING_SETUP_UNSUPPORTED_PROJECT_GRAPH'; END IF;
  IF (SELECT array_agg(tgname::text ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organizations'::regclass AND NOT tgisinternal)
      IS DISTINCT FROM ARRAY['trg_org_protect_billing','trg_organizations_updated_at']::text[]
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.organizations'::regclass AND NOT tgisinternal AND
      (tgenabled<>'O' OR tgtype<>19 OR tgdeferrable OR tginitdeferred OR
       tgfoid<>CASE tgname WHEN 'trg_org_protect_billing' THEN 'public.org_protect_billing_columns()'::regprocedure ELSE 'public.organizations_touch_updated_at()'::regprocedure END)) THEN
    RAISE EXCEPTION 'DRAWING_SETUP_TRIGGER_EFFECTS'; END IF;

  SELECT array_agg((value->>'id')::uuid ORDER BY value->>'id') INTO org_ids FROM jsonb_array_elements(r->'organizations');
  PERFORM id FROM public.organizations WHERE id=ANY(org_ids) ORDER BY id FOR UPDATE NOWAIT;
  FOR org IN SELECT value FROM jsonb_array_elements(r->'organizations') LOOP
    SELECT value INTO owner_actor FROM jsonb_array_elements(r->'actors') WHERE value->>'alias'=CASE org->>'alias' WHEN 'A' THEN 'admin' WHEN 'B' THEN 'foreign' END;
    SELECT value INTO member FROM jsonb_array_elements(r->'memberships') WHERE value->>'orgId'=org->>'id';
    SELECT value INTO x FROM jsonb_array_elements(p->'organizations') WHERE value->>'alias'=org->>'alias';
    IF owner_actor IS NULL OR member IS NULL OR x IS NULL OR org->>'createdBy' IS DISTINCT FROM owner_actor->>'id'
      OR org->>'ownerId' IS DISTINCT FROM owner_actor->>'id' OR member->>'userId' IS DISTINCT FROM owner_actor->>'id'
      OR member->>'actor' IS DISTINCT FROM owner_actor->>'alias' OR member->>'role' IS DISTINCT FROM 'owner'
      OR (SELECT count(*) FROM public.organizations o WHERE o.id=(org->>'id')::uuid AND o.created_by=(org->>'createdBy')::uuid
        AND o.name=x->>'name' AND o.slug=x->>'slug' AND o.plan='free' AND o.member_default_project_role='viewer'
        AND o.created_at>=v_created_at AND o.created_at<=v_observed_at AND o.stripe_customer_id IS NULL
        AND o.stripe_subscription_id IS NULL AND o.subscription_status IS NULL AND o.current_period_end IS NULL) <> 1
      OR (SELECT count(*) FROM public.organization_members m WHERE m.org_id=(org->>'id')::uuid)<>1
      OR NOT EXISTS(SELECT 1 FROM public.organization_members m WHERE m.org_id=(org->>'id')::uuid
        AND m.id=(member->>'id')::uuid AND m.user_id=(owner_actor->>'id')::uuid AND m.role='owner') THEN
      RAISE EXCEPTION 'DRAWING_SETUP_ORGANIZATION_STATE'; END IF;
  END LOOP;
  -- Fixed reads only; no catalog-derived or request-controlled executable SQL.
  SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') INTO before_orgs FROM public.organizations o WHERE id=ANY(org_ids);
  SELECT coalesce(jsonb_agg(jsonb_build_array(t,row) ORDER BY t,row::text),'[]') INTO before_children FROM (
    SELECT 'billing_checkout_intents' t,to_jsonb(c) row FROM private.billing_checkout_intents c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'stripe_billing_sync_state',to_jsonb(c) FROM private.stripe_billing_sync_state c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'account_deletions',to_jsonb(c) FROM public.account_deletions c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'billing_events',to_jsonb(c) FROM public.billing_events c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'client_events',to_jsonb(c) FROM public.client_events c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'data_erasure_log',to_jsonb(c) FROM public.data_erasure_log c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'note_folder_audit_events',to_jsonb(c) FROM public.note_folder_audit_events c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'note_folder_migrations',to_jsonb(c) FROM public.note_folder_migrations c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'note_folder_mutation_receipts',to_jsonb(c) FROM public.note_folder_mutation_receipts c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'note_folders',to_jsonb(c) FROM public.note_folders c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'organization_invitations',to_jsonb(c) FROM public.organization_invitations c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'organization_members',to_jsonb(c) FROM public.organization_members c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'projects',to_jsonb(c) FROM public.projects c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'vendors',to_jsonb(c) FROM public.vendors c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'adopted_sources',to_jsonb(c) FROM steelbuild_drawing_revision.adopted_sources c WHERE org_id=ANY(org_ids)) children;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(before_children) c WHERE c->>0<>'organization_members' AND (c->1->>'org_id')::uuid=ANY(org_ids)) THEN
    RAISE EXCEPTION 'DRAWING_SETUP_EXISTING_CHILD'; END IF;
  FOREACH v_org_id IN ARRAY org_ids LOOP
    IF clock_timestamp() >= v_expires_at THEN RAISE EXCEPTION 'DRAWING_SETUP_EXPIRED_DURING_UPDATE'; END IF;
    WITH changed AS (UPDATE public.organizations o SET plan='pro'
      WHERE o.id=v_org_id AND o.plan='free' AND o.stripe_customer_id IS NULL AND o.stripe_subscription_id IS NULL
        AND o.subscription_status IS NULL AND o.current_period_end IS NULL
        AND o.created_by=(SELECT (value->>'createdBy')::uuid FROM jsonb_array_elements(r->'organizations') WHERE value->>'id'=v_org_id::text)
      RETURNING o.id) SELECT count(*) INTO affected FROM changed;
    IF affected<>1 THEN RAISE EXCEPTION 'DRAWING_SETUP_RETURNING_CARDINALITY'; END IF;
    touched := touched + affected;
  END LOOP;
  IF touched<>2 THEN RAISE EXCEPTION 'DRAWING_SETUP_RETURNING_CARDINALITY'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') INTO after_orgs FROM public.organizations o WHERE id=ANY(org_ids);
  IF jsonb_array_length(after_orgs) <> jsonb_array_length(before_orgs) THEN RAISE EXCEPTION 'DRAWING_SETUP_UNEXPECTED_EFFECT'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(before_orgs) LOOP
    SELECT value INTO y FROM jsonb_array_elements(after_orgs) WHERE value->>'id'=x->>'id';
    IF (x->>'id')::uuid=ANY(org_ids) THEN
      IF y->>'plan' IS DISTINCT FROM 'pro' OR (y->>'updated_at')::timestamptz IS DISTINCT FROM transaction_timestamp()
        OR (y-ARRAY['plan','updated_at']) IS DISTINCT FROM (x-ARRAY['plan','updated_at']) THEN
        RAISE EXCEPTION 'DRAWING_SETUP_UNEXPECTED_EFFECT'; END IF;
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_array(t,row) ORDER BY t,row::text),'[]') INTO after_children FROM (
    SELECT 'billing_checkout_intents' t,to_jsonb(c) row FROM private.billing_checkout_intents c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'stripe_billing_sync_state',to_jsonb(c) FROM private.stripe_billing_sync_state c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'account_deletions',to_jsonb(c) FROM public.account_deletions c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'billing_events',to_jsonb(c) FROM public.billing_events c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'client_events',to_jsonb(c) FROM public.client_events c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'data_erasure_log',to_jsonb(c) FROM public.data_erasure_log c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'note_folder_audit_events',to_jsonb(c) FROM public.note_folder_audit_events c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'note_folder_migrations',to_jsonb(c) FROM public.note_folder_migrations c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'note_folder_mutation_receipts',to_jsonb(c) FROM public.note_folder_mutation_receipts c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'note_folders',to_jsonb(c) FROM public.note_folders c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'organization_invitations',to_jsonb(c) FROM public.organization_invitations c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'organization_members',to_jsonb(c) FROM public.organization_members c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'projects',to_jsonb(c) FROM public.projects c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'vendors',to_jsonb(c) FROM public.vendors c WHERE org_id=ANY(org_ids) UNION ALL
    SELECT 'adopted_sources',to_jsonb(c) FROM steelbuild_drawing_revision.adopted_sources c WHERE org_id=ANY(org_ids)) children;
  IF after_children IS DISTINCT FROM before_children THEN RAISE EXCEPTION 'DRAWING_SETUP_CHILD_EFFECT'; END IF;
  IF clock_timestamp() >= v_expires_at THEN RAISE EXCEPTION 'DRAWING_SETUP_EXPIRED_DURING_UPDATE'; END IF;
END
$entitlements$;
-- Only the two private reviewed identities are returned. No audit rows are
-- expected: the reviewed organization UPDATE has billing guard + timestamp only.
SELECT o.id,o.created_by,o.plan,o.updated_at,o.stripe_customer_id,o.stripe_subscription_id,o.subscription_status,o.current_period_end
FROM public.organizations o WHERE o.id IN
  (SELECT (value->>'id')::uuid FROM jsonb_array_elements(current_setting('drawing_setup.receipt')::jsonb->'organizations')) ORDER BY o.id;
