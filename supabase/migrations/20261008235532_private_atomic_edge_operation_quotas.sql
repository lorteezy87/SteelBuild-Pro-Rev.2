-- LOCAL CANDIDATE: manually review/apply/ledger-stamp before dependent handlers.
-- No db push/repair. Durable accounting never depends on editable correspondence
-- or best-effort telemetry. Unknown operations are NEVER automatically retried.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE SCHEMA steelbuild_edge_private;
REVOKE ALL ON SCHEMA steelbuild_edge_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE steelbuild_edge_private.scopes (
  kind text NOT NULL CHECK(kind IN('email-send','llm-proxy','email-classify')),
  scope_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(kind,scope_id)
);
CREATE TABLE steelbuild_edge_private.operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  scope_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  project_erased boolean NOT NULL DEFAULT false,
  request_key text NOT NULL CHECK(length(request_key) BETWEEN 8 AND 128),
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','completed','unknown')),
  reserved_cost numeric(20,6) NOT NULL CHECK(reserved_cost>=0 AND reserved_cost<1000000000),
  actual_cost numeric(20,6) CHECK(actual_cost>=0 AND actual_cost<1000000000),
  result jsonb CHECK(result IS NULL OR octet_length(result::text)<=1048576),
  response_status integer CHECK(response_status BETWEEN 200 AND 599),
  finished_at timestamptz,
  FOREIGN KEY(kind,scope_id) REFERENCES steelbuild_edge_private.scopes(kind,scope_id),
  UNIQUE(kind,scope_id,request_key),
  CHECK((kind='email-classify' AND user_id IS NULL) OR (kind<>'email-classify' AND user_id IS NOT NULL))
);
CREATE INDEX edge_operation_window ON steelbuild_edge_private.operations(kind,scope_id,created_at);
CREATE INDEX edge_operation_cached_results ON steelbuild_edge_private.operations(created_at) WHERE result IS NOT NULL;
ALTER TABLE steelbuild_edge_private.scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE steelbuild_edge_private.operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA steelbuild_edge_private FROM PUBLIC,anon,authenticated,service_role;

-- Project erasure removes cached output without deleting user-wide accounting.
-- Account erasure cascades user operations; empty scope locks carry only UUIDs.
CREATE FUNCTION steelbuild_edge_private.erase_project_result()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.project_id IS NOT NULL AND NEW.project_id IS NULL THEN NEW.project_erased:=true; END IF;
  IF NEW.project_erased THEN NEW.result:=NULL; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION steelbuild_edge_private.erase_project_result() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER erase_project_result BEFORE UPDATE ON steelbuild_edge_private.operations
FOR EACH ROW EXECUTE FUNCTION steelbuild_edge_private.erase_project_result();

CREATE FUNCTION public.reserve_edge_operation(p_kind text,p_user_id uuid,p_project_id uuid,p_request_key text,p_fingerprint text,p_count_limit integer,p_cost_limit numeric,p_reserved_cost numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_scope uuid; v_existing steelbuild_edge_private.operations%ROWTYPE;
  v_id uuid; v_count bigint; v_cost numeric; v_since timestamptz;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN('email-send','llm-proxy','email-classify')
     OR p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 8 AND 128
     OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_count_limit IS NULL OR p_count_limit<0
     OR p_cost_limit IS NULL OR NOT(p_cost_limit>=0 AND p_cost_limit<1000000000)
     OR p_reserved_cost IS NULL OR NOT(p_reserved_cost>=0 AND p_reserved_cost<1000000000) THEN
    RAISE EXCEPTION 'Invalid operation reservation' USING ERRCODE='22023';
  END IF;
  IF (p_kind='email-classify' AND (p_project_id IS NULL OR p_user_id IS NOT NULL))
    OR (p_kind<>'email-classify' AND p_user_id IS NULL)
    OR (p_kind='email-send' AND p_project_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid operation scope' USING ERRCODE='22023';
  END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Project unavailable' USING ERRCODE='42501';
  END IF;
  v_scope:=CASE WHEN p_kind='email-classify' THEN p_project_id ELSE p_user_id END;
  -- A real write both serializes READ COMMITTED reservations and invalidates a
  -- stale REPEATABLE READ/SERIALIZABLE snapshot (which must fail, not undercount).
  INSERT INTO steelbuild_edge_private.scopes(kind,scope_id,revision) VALUES(p_kind,v_scope,1)
    ON CONFLICT(kind,scope_id) DO UPDATE SET revision=steelbuild_edge_private.scopes.revision+1;
  SELECT * INTO v_existing FROM steelbuild_edge_private.operations
    WHERE kind=p_kind AND scope_id=v_scope AND request_key=p_request_key;
  IF FOUND THEN
    IF v_existing.fingerprint<>p_fingerprint OR v_existing.project_id IS DISTINCT FROM p_project_id THEN
      RETURN jsonb_build_object('decision','conflict','operation_id',v_existing.id);
    END IF;
    IF v_existing.state='completed' THEN
      IF v_existing.created_at<clock_timestamp()-interval '24 hours' THEN
        UPDATE steelbuild_edge_private.operations SET result=NULL WHERE id=v_existing.id;
        v_existing.result:=NULL;
      END IF;
      RETURN jsonb_build_object('decision',CASE WHEN v_existing.result IS NULL THEN 'completed' ELSE 'replay' END,
        'operation_id',v_existing.id,'result',v_existing.result,'response_status',v_existing.response_status);
    END IF;
    RETURN jsonb_build_object('decision',v_existing.state,'operation_id',v_existing.id);
  END IF;
  v_since:=clock_timestamp()-CASE WHEN p_kind='email-send' THEN interval '1 hour' ELSE interval '24 hours' END;
  SELECT count(*),coalesce(sum(coalesce(actual_cost,reserved_cost)),0) INTO v_count,v_cost
    FROM steelbuild_edge_private.operations WHERE kind=p_kind AND scope_id=v_scope AND created_at>=v_since;
  IF (p_count_limit>0 AND v_count>=p_count_limit) OR (p_cost_limit>0 AND v_cost+p_reserved_cost>p_cost_limit) THEN
    RETURN jsonb_build_object('decision','limited');
  END IF;
  INSERT INTO steelbuild_edge_private.operations(kind,scope_id,user_id,project_id,request_key,fingerprint,reserved_cost)
    VALUES(p_kind,v_scope,p_user_id,p_project_id,p_request_key,p_fingerprint,p_reserved_cost) RETURNING id INTO v_id;
  RETURN jsonb_build_object('decision','reserved','operation_id',v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_edge_operation(text,uuid,uuid,text,text,integer,numeric,numeric) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_edge_operation(text,uuid,uuid,text,text,integer,numeric,numeric) TO service_role;

CREATE FUNCTION public.finish_edge_operation(p_operation_id uuid,p_state text,p_actual_cost numeric,p_result jsonb,p_response_status integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_changed integer;
BEGIN
  IF p_state IS NULL OR p_state NOT IN('completed','unknown')
    OR (p_actual_cost IS NOT NULL AND NOT(p_actual_cost>=0 AND p_actual_cost<1000000000))
    OR p_response_status IS NULL OR p_response_status NOT BETWEEN 200 AND 599
    OR (p_result IS NOT NULL AND octet_length(p_result::text)>1048576) THEN
    RAISE EXCEPTION 'Invalid operation completion' USING ERRCODE='22023';
  END IF;
  UPDATE steelbuild_edge_private.operations SET state=p_state,
    actual_cost=CASE WHEN p_state='completed' THEN p_actual_cost ELSE NULL END,
    result=CASE WHEN p_state='completed' AND NOT project_erased THEN p_result ELSE NULL END,
    response_status=p_response_status,finished_at=clock_timestamp()
    WHERE id=p_operation_id AND state='pending';
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  RETURN v_changed=1;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_edge_operation(uuid,text,numeric,jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finish_edge_operation(uuid,text,numeric,jsonb,integer) TO service_role;
CREATE FUNCTION public.purge_edge_operation_results(p_batch_size integer DEFAULT 500)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_changed integer;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Invalid purge batch size' USING ERRCODE='22023';
  END IF;
  WITH expired AS (
    SELECT id FROM steelbuild_edge_private.operations
    WHERE result IS NOT NULL AND created_at<clock_timestamp()-interval '24 hours'
    ORDER BY created_at LIMIT p_batch_size FOR UPDATE SKIP LOCKED
  ) UPDATE steelbuild_edge_private.operations o SET result=NULL FROM expired e WHERE o.id=e.id;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  RETURN v_changed;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_edge_operation_results(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_edge_operation_results(integer) TO service_role;
-- Never delete pending/unknown or key tombstones automatically. Operators must
-- reconcile ambiguous effects before changing their state. Purge cached results
-- older than 24h on a reviewed maintenance schedule; retain accounting/tombstones.
NOTIFY pgrst,'reload schema';
COMMIT;
