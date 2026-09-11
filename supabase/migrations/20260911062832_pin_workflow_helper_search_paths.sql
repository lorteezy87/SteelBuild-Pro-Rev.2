-- Harden the eight pure SQL helpers verified against live definitions on 2026-09-11.
-- Optional modules may be absent in a Rev 2-only replay. Existing helpers must
-- still match the reviewed body and retain immutable SECURITY INVOKER semantics.
-- This changes configuration only: no body, privilege, data or history rewrites.
DO $hardening$
DECLARE
  helper record;
  target oid;
  definition_matches boolean;
BEGIN
  FOR helper IN SELECT * FROM (VALUES
    ('public.backcharge_transition_allowed(text, text)', '10901fd94365f2d2593dede9a071918fcd2247bac9cfe51b59f3cf9d780344ca'),
    ('public.change_order_transition_allowed(text, text)', 'd212ef93be93ba3b5ccb8ab6910b3839dfdf4b99da8ea9bb4dfadbf2dbb8d6e8'),
    ('public.expense_transition_allowed(text, text)', '2d556648047f1d939fcbdb3dfbdca60787b16d09be7224d08ec99b022eff5664'),
    ('public.pay_application_transition_allowed(text, text)', '18a781af0ba3691a79edc49c8d818d82f77c98038dcc64a21ab48f1a640d4844'),
    ('public.risk_transition_allowed(text, text)', '978479f49aa903c87bf1881123baefdd3ed5f13c6e08fc35d119e88da943f4df'),
    ('public.submittal_bic_class(text)', '1d841c7d48c5e12c5c7d4ec9b55b55fbc92be9111ea77d5f6f48161f45320063'),
    ('public.submittal_derived_stage(text, text, date)', '2d1a76f2b1e4e95a0ec26353abcdb4d3d9bf921839413352ba66d2ce1c830d84'),
    ('public.submittal_ofs_checklist_complete(jsonb)', '83177fe41da779bcb6a9057d5cf19f7b86de0dbf1fae86109903d0be9ac08ad0')
  ) AS reviewed(signature, body_sha256)
  LOOP
    target := to_regprocedure(helper.signature);
    IF target IS NULL THEN
      RAISE NOTICE 'Optional helper absent: %', helper.signature;
      CONTINUE;
    END IF;
    SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') = helper.body_sha256
      AND NOT p.prosecdef AND p.provolatile = 'i' AND l.lanname = 'sql'
    INTO definition_matches
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.oid = target;
    IF definition_matches IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Unreviewed definition for %; inspect before hardening', helper.signature;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = %L', helper.signature, '');
  END LOOP;
END
$hardening$;
