-- STAGING ONLY. Insert the exact candidate body without BEGIN/COMMIT immediately
-- before the temp table for pre-apply rehearsal. Always rolls back all fixtures.
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE checkout_acceptance_results(name text PRIMARY KEY,passed boolean NOT NULL);
CREATE TEMP TABLE checkout_context(operation_id uuid,expires_at timestamptz);
GRANT SELECT,INSERT,UPDATE ON checkout_acceptance_results,checkout_context TO authenticated,service_role,anon;
CREATE FUNCTION pg_temp.assert_checkout(p_name text,p_ok boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Checkout acceptance failed: %',p_name; END IF;
 INSERT INTO checkout_acceptance_results VALUES(p_name,true);
END $$;
CREATE FUNCTION pg_temp.expect_checkout_error(p_name text,p_sql text,p_code text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE v_code text; BEGIN
 BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_code=RETURNED_SQLSTATE; END;
 PERFORM pg_temp.assert_checkout(p_name,v_code=p_code);
END $$;
CREATE FUNCTION pg_temp.begin_checkout(p_actor uuid DEFAULT '91da0000-0000-4000-8000-000000000001',p_price text DEFAULT 'price_rollback') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.begin_billing_checkout('91da0000-0000-4000-8000-000000000011',p_actor,'pro',p_price,false,'https://www.steelbuild-pro.com') $$;
CREATE FUNCTION pg_temp.bind_checkout(p_customer text DEFAULT 'cus_checkout_rollback') RETURNS void LANGUAGE sql AS $$
 SELECT public.bind_billing_checkout_customer('91da0000-0000-4000-8000-000000000011','91da0000-0000-4000-8000-000000000001',
 (SELECT operation_id FROM checkout_context),p_customer) $$;
CREATE FUNCTION pg_temp.record_checkout(p_session text DEFAULT 'cs_checkout_rollback') RETURNS void LANGUAGE sql AS $$
 SELECT public.record_billing_checkout_session('91da0000-0000-4000-8000-000000000011','91da0000-0000-4000-8000-000000000001',
 (SELECT operation_id FROM checkout_context),'cus_checkout_rollback',p_session,'https://checkout.stripe.com/c/pay/rollback',
 (SELECT expires_at FROM checkout_context)) $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('91da0000-0000-4000-8000-000000000001','checkout-owner-rollback@example.invalid','{}'),
 ('91da0000-0000-4000-8000-000000000002','checkout-stranger-rollback@example.invalid','{}');
INSERT INTO public.organizations(id,name,plan) VALUES
 ('91da0000-0000-4000-8000-000000000011','Synthetic checkout rollback acceptance','free');
INSERT INTO public.organization_members(org_id,user_id,role) VALUES
 ('91da0000-0000-4000-8000-000000000011','91da0000-0000-4000-8000-000000000001','owner');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
INSERT INTO checkout_context SELECT (pg_temp.begin_checkout()->'intent'->>'operation_id')::uuid,date_trunc('second',clock_timestamp()+interval '1 hour');
SELECT pg_temp.assert_checkout('Current owner receives one durable reservation',
 (pg_temp.begin_checkout()->'intent'->>'operation_id')::uuid=(SELECT operation_id FROM checkout_context));
SELECT pg_temp.assert_checkout('Retry preserves the originally reserved price',
 pg_temp.begin_checkout('91da0000-0000-4000-8000-000000000001','price_changed')->'intent'->>'price_id'='price_rollback');
SELECT pg_temp.expect_checkout_error('Foreign verified actor cannot reserve checkout',
 $q$SELECT pg_temp.begin_checkout('91da0000-0000-4000-8000-000000000002')$q$,'42501');
SELECT pg_temp.bind_checkout();
SELECT pg_temp.bind_checkout();
SELECT pg_temp.assert_checkout('Actual billing guard accepts service-only confirmed customer binding',
 pg_temp.begin_checkout()->'intent'->>'customer_id'='cus_checkout_rollback'
 AND (SELECT stripe_customer_id='cus_checkout_rollback' FROM public.organizations WHERE id='91da0000-0000-4000-8000-000000000011'));
SELECT pg_temp.expect_checkout_error('A different customer cannot replace the binding',
 $q$SELECT pg_temp.bind_checkout('cus_foreign')$q$,'22023');
SELECT pg_temp.record_checkout();
SELECT pg_temp.record_checkout();
SELECT pg_temp.assert_checkout('Provider session receipt is durable and repeatable',
 pg_temp.begin_checkout()->'intent'->>'session_id'='cs_checkout_rollback');
SELECT pg_temp.expect_checkout_error('Another payable session cannot replace the confirmed session',
 $q$SELECT pg_temp.record_checkout('cs_duplicate')$q$,'22023');
SELECT pg_temp.expect_checkout_error('Unexpired session cannot release its reservation',
 $q$SELECT public.expire_billing_checkout_intent('91da0000-0000-4000-8000-000000000011','91da0000-0000-4000-8000-000000000001',
 (SELECT operation_id FROM checkout_context),'cs_checkout_rollback',(SELECT expires_at FROM checkout_context))$q$,'40001');
SELECT pg_temp.expect_checkout_error('Service role cannot bypass RPCs to read private intents',
 $q$SELECT * FROM private.billing_checkout_intents$q$,'42501');
SELECT public.apply_stripe_billing_event('evt_checkout_rollback_paid','checkout.session.completed',
 '91da0000-0000-4000-8000-000000000011',0,'cus_checkout_rollback',NULL,'sub_checkout_rollback','cus_checkout_rollback',200,NULL,
 '{"plan":"pro","subscription_status":"active","stripe_customer_id":"cus_checkout_rollback","stripe_subscription_id":"sub_checkout_rollback","current_period_end":null}');
SELECT pg_temp.assert_checkout('Installed atomic billing immediately routes the now-paid workspace to its portal',
 pg_temp.begin_checkout()->>'decision'='portal');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"91da0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_checkout_error('Authenticated owner cannot reserve through the service-only API',
 $q$SELECT pg_temp.begin_checkout()$q$,'42501');
SELECT pg_temp.expect_checkout_error('Authenticated owner cannot forge a customer binding',
 $q$SELECT pg_temp.bind_checkout()$q$,'42501');
SELECT pg_temp.expect_checkout_error('Authenticated owner cannot forge a provider receipt',
 $q$SELECT pg_temp.record_checkout()$q$,'42501');
SELECT pg_temp.expect_checkout_error('Authenticated owner cannot read private checkout state',
 $q$SELECT * FROM private.billing_checkout_intents$q$,'42501');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_checkout_error('Anonymous caller cannot reserve checkout',
 $q$SELECT pg_temp.begin_checkout()$q$,'42501');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"91da0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT public.hard_delete_organization('91da0000-0000-4000-8000-000000000011','Synthetic checkout rollback acceptance');
RESET ROLE;
SELECT pg_temp.assert_checkout('Audited workspace erasure cascades the private checkout intent',
 NOT EXISTS(SELECT 1 FROM public.organizations WHERE id='91da0000-0000-4000-8000-000000000011')
 AND NOT EXISTS(SELECT 1 FROM private.billing_checkout_intents WHERE org_id='91da0000-0000-4000-8000-000000000011'));
SELECT pg_temp.assert_checkout('Audited erasure retains its workspace receipt',
 EXISTS(SELECT 1 FROM public.data_erasure_log WHERE org_id='91da0000-0000-4000-8000-000000000011' AND reason='Synthetic checkout rollback acceptance'));
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_checkout_error('Late provider callback cannot recreate an erased workspace binding',
 $q$SELECT pg_temp.bind_checkout()$q$,'P0002');
RESET ROLE;
SELECT pg_temp.assert_checkout('Checkout API grants and function search paths remain constrained',
 (SELECT count(*)=4 AND bool_and(p.prosecdef AND 'search_path=""'=ANY(p.proconfig)
 AND has_function_privilege('service_role',p.oid,'execute') AND NOT has_function_privilege('authenticated',p.oid,'execute')
 AND NOT has_function_privilege('anon',p.oid,'execute')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('begin_billing_checkout','bind_billing_checkout_customer','record_billing_checkout_session','expire_billing_checkout_intent')));
SELECT count(*) AS passed,jsonb_agg(name ORDER BY name) AS checks FROM checkout_acceptance_results;
ROLLBACK;
