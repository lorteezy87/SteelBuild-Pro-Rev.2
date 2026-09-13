-- SOV line numbers and IDs are official project records. Mint them in the
-- database transaction that inserts the row so concurrent clients cannot
-- reserve the same number or bypass sequencing with a direct table insert.

CREATE OR REPLACE FUNCTION public.create_sov_item(p_item jsonb)
RETURNS public.sov_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid;
  v_existing_max integer;
  v_line_number integer;
  v_created public.sov_items;
BEGIN
  IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN
    RAISE EXCEPTION 'SOV item payload must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  v_project_id := NULLIF(p_item->>'project_id', '')::uuid;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND NOT public.user_has_project_role_at_least(v_project_id, 'pm') THEN
    RAISE EXCEPTION 'Not authorized to create SOV items for this project'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(MAX(s.line_item_number), 0)
  INTO v_existing_max
  FROM public.sov_items AS s
  WHERE s.project_id = v_project_id;

  INSERT INTO public.number_sequences (project_id, record_type, next_value)
  VALUES (v_project_id, 'SOV', v_existing_max + 2)
  ON CONFLICT (project_id, record_type)
  DO UPDATE SET
    next_value = GREATEST(
      public.number_sequences.next_value + 1,
      EXCLUDED.next_value
    ),
    updated_at = now()
  RETURNING next_value - 1 INTO v_line_number;

  PERFORM set_config('app.sov_item_create_rpc', 'on', true);

  INSERT INTO public.sov_items (
    project_id,
    project_name,
    application_number,
    period_from,
    period_to,
    line_item_number,
    description,
    scheduled_value,
    previous_percent_complete,
    current_percent_complete,
    retainage_percent,
    status,
    metadata,
    sov_id,
    submitted_date,
    payment_received_date,
    cost_code,
    cost_code_name
  )
  VALUES (
    v_project_id,
    NULLIF(p_item->>'project_name', ''),
    COALESCE(NULLIF(p_item->>'application_number', '')::integer, 1),
    NULLIF(p_item->>'period_from', '')::date,
    NULLIF(p_item->>'period_to', '')::date,
    v_line_number,
    COALESCE(p_item->>'description', ''),
    COALESCE(NULLIF(p_item->>'scheduled_value', '')::numeric, 0),
    COALESCE(NULLIF(p_item->>'previous_percent_complete', '')::numeric, 0),
    COALESCE(NULLIF(p_item->>'current_percent_complete', '')::numeric, 0),
    COALESCE(NULLIF(p_item->>'retainage_percent', '')::numeric, 10),
    COALESCE(NULLIF(p_item->>'status', ''), 'Draft'),
    COALESCE(p_item->'metadata', '{}'::jsonb),
    v_line_number::text,
    NULLIF(p_item->>'submitted_date', '')::date,
    NULLIF(p_item->>'payment_received_date', '')::date,
    NULLIF(p_item->>'cost_code', ''),
    NULLIF(p_item->>'cost_code_name', '')
  )
  RETURNING * INTO v_created;

  RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_sov_items(p_items jsonb[])
RETURNS SETOF public.sov_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
BEGIN
  IF p_items IS NULL THEN
    RAISE EXCEPTION 'SOV item payloads are required'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_item IN ARRAY p_items LOOP
    RETURN NEXT public.create_sov_item(v_item);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sov_item_rpc_create()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.sov_item_create_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use create_sov_item() — SOV line numbers are minted there'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_trigger record;
BEGIN
  FOR v_trigger IN
    SELECT t.tgname
    FROM pg_trigger AS t
    JOIN pg_proc AS p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.sov_items'::regclass
      AND NOT t.tgisinternal
      AND pg_get_functiondef(p.oid) LIKE '%create_sov_item()%SOV line numbers%'
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.sov_items', v_trigger.tgname);
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS enforce_sov_item_rpc_create ON public.sov_items;
CREATE TRIGGER enforce_sov_item_rpc_create
BEFORE INSERT ON public.sov_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_sov_item_rpc_create();

REVOKE ALL ON FUNCTION public.create_sov_item(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_sov_items(jsonb[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_sov_item_rpc_create() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_sov_item(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_sov_items(jsonb[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_sov_item_rpc_create() TO service_role;
