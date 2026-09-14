-- Expense numbers are official records. Allocate each number in the same
-- transaction that inserts the expense, and reject direct table inserts.

CREATE OR REPLACE FUNCTION public.create_expense(
  p_project_id uuid,
  p_payload jsonb
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_max integer;
  v_expense_number integer;
  v_project_name text;
  v_created public.expenses;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Expense payload must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to log expenses for this project'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_payload->>'description'), '') IS NULL THEN
    RAISE EXCEPTION 'description is required'
      USING ERRCODE = '23514';
  END IF;

  SELECT p.name
  INTO v_project_name
  FROM public.projects AS p
  WHERE p.id = p_project_id
    AND NOT p.is_deleted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
    MAX(substring(e.expense_number FROM '([0-9]+)$')::integer),
    0
  )
  INTO v_existing_max
  FROM public.expenses AS e
  WHERE e.project_id = p_project_id
    AND e.expense_number ~ '[0-9]+$';

  INSERT INTO public.number_sequences (project_id, record_type, next_value)
  VALUES (p_project_id, 'EXPENSE', v_existing_max + 2)
  ON CONFLICT (project_id, record_type)
  DO UPDATE SET
    next_value = GREATEST(
      public.number_sequences.next_value + 1,
      EXCLUDED.next_value
    ),
    updated_at = now()
  RETURNING next_value - 1 INTO v_expense_number;

  PERFORM set_config('app.expense_create_rpc', 'on', true);

  INSERT INTO public.expenses (
    project_id,
    project_name,
    expense_number,
    description,
    expense_type,
    cost_code,
    cost_code_name,
    amount,
    quantity,
    unit_cost,
    unit,
    vendor,
    invoice_number,
    invoice_date,
    payment_status,
    payment_date,
    work_package_id,
    work_package_name,
    sov_line_item_id,
    sov_line_item_name,
    expense_date,
    submitted_by,
    approved_by,
    approved_date,
    notes,
    receipt_url,
    tags,
    metadata
  )
  VALUES (
    p_project_id,
    v_project_name,
    v_expense_number::text,
    btrim(p_payload->>'description'),
    NULLIF(p_payload->>'expense_type', ''),
    NULLIF(p_payload->>'cost_code', ''),
    NULLIF(p_payload->>'cost_code_name', ''),
    COALESCE(NULLIF(p_payload->>'amount', '')::numeric, 0),
    COALESCE(NULLIF(p_payload->>'quantity', '')::numeric, 1),
    NULLIF(p_payload->>'unit_cost', '')::numeric,
    NULLIF(p_payload->>'unit', ''),
    NULLIF(p_payload->>'vendor', ''),
    NULLIF(p_payload->>'invoice_number', ''),
    NULLIF(p_payload->>'invoice_date', '')::date,
    COALESCE(NULLIF(p_payload->>'payment_status', ''), 'Unpaid'),
    NULLIF(p_payload->>'payment_date', '')::date,
    NULLIF(p_payload->>'work_package_id', '')::uuid,
    NULLIF(p_payload->>'work_package_name', ''),
    NULLIF(p_payload->>'sov_line_item_id', '')::uuid,
    NULLIF(p_payload->>'sov_line_item_name', ''),
    NULLIF(p_payload->>'expense_date', '')::date,
    NULLIF(p_payload->>'submitted_by', ''),
    NULLIF(p_payload->>'approved_by', ''),
    NULLIF(p_payload->>'approved_date', '')::date,
    NULLIF(p_payload->>'notes', ''),
    NULLIF(p_payload->>'receipt_url', ''),
    NULLIF(p_payload->>'tags', ''),
    COALESCE(p_payload->'metadata', '{}'::jsonb)
  )
  RETURNING * INTO v_created;

  RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_expense_rpc_create()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.expense_create_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use create_expense() - expense numbers are minted there'
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
    WHERE t.tgrelid = 'public.expenses'::regclass
      AND NOT t.tgisinternal
      AND pg_get_functiondef(p.oid) LIKE '%create_expense()%expense numbers%'
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.expenses', v_trigger.tgname);
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS enforce_expense_rpc_create ON public.expenses;
CREATE TRIGGER enforce_expense_rpc_create
BEFORE INSERT ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.enforce_expense_rpc_create();

REVOKE ALL ON FUNCTION public.create_expense(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_expense_rpc_create()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_expense(uuid, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_expense_rpc_create() TO service_role;
