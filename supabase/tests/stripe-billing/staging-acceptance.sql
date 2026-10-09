-- STAGING ONLY. Insert the exact candidate body (without BEGIN/COMMIT)
-- after the timeouts to rehearse an unapplied candidate. Always rolls back.
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE billing_acceptance_results(name text PRIMARY KEY,passed boolean NOT NULL);
GRANT SELECT,INSERT ON billing_acceptance_results TO authenticated,service_role,anon;
CREATE FUNCTION pg_temp.assert_billing(p_name text,p_ok boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN
 IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Billing acceptance failed: %',p_name; END IF;
 INSERT INTO billing_acceptance_results VALUES(p_name,true);
END $$;
CREATE FUNCTION pg_temp.expect_billing_error(p_name text,p_sql text,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$ DECLARE v_code text; BEGIN
 BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_code=RETURNED_SQLSTATE; END;
 PERFORM pg_temp.assert_billing(p_name,v_code=p_code);
END $$;
CREATE FUNCTION pg_temp.apply_billing(p_event text,p_revision bigint,p_plan text DEFAULT 'pro',p_status text DEFAULT 'active',p_end text DEFAULT NULL)
RETURNS text LANGUAGE sql SECURITY INVOKER AS $$
 SELECT public.apply_stripe_billing_event(p_event,'customer.subscription.updated',
 '91d90000-0000-4000-8000-000000000011',p_revision,'cus_rollback_billing','sub_rollback_billing',
 'sub_rollback_billing','cus_rollback_billing',200,NULL,
 jsonb_build_object('plan',p_plan,'subscription_status',p_status,'stripe_customer_id','cus_rollback_billing',
 'stripe_subscription_id','sub_rollback_billing','current_period_end',p_end));
$$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('91d90000-0000-4000-8000-000000000001','billing-owner-rollback@example.invalid','{}'),
 ('91d90000-0000-4000-8000-000000000002','billing-foreign-rollback@example.invalid','{}');
INSERT INTO public.organizations(id,name,plan,stripe_customer_id,stripe_subscription_id,subscription_status) VALUES
 ('91d90000-0000-4000-8000-000000000011','Synthetic billing rollback acceptance','business','cus_rollback_billing','sub_rollback_billing','active'),
 ('91d90000-0000-4000-8000-000000000012','Synthetic foreign billing rollback acceptance','enterprise',NULL,NULL,NULL);
INSERT INTO public.organization_members(org_id,user_id,role) VALUES
 ('91d90000-0000-4000-8000-000000000011','91d90000-0000-4000-8000-000000000001','owner'),
 ('91d90000-0000-4000-8000-000000000012','91d90000-0000-4000-8000-000000000002','owner');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_billing('Service role can read a consistent billing snapshot',
 public.get_stripe_billing_snapshot('91d90000-0000-4000-8000-000000000011')->>'revision'='0');
SELECT pg_temp.assert_billing('Actual billing guards permit atomic webhook application',
 pg_temp.apply_billing('evt_rollback_billing_applied',0)='applied');
SELECT pg_temp.assert_billing('Application persists exactly one plan change and one receipt',
 (SELECT plan='pro' AND subscription_status='active' FROM public.organizations WHERE id='91d90000-0000-4000-8000-000000000011')
 AND (SELECT count(*)=1 FROM public.billing_events WHERE stripe_event_id='evt_rollback_billing_applied')
 AND public.get_stripe_billing_snapshot('91d90000-0000-4000-8000-000000000011')->>'revision'='1');
SELECT pg_temp.assert_billing('Duplicate receipt prevents a contradictory reapplication',
 pg_temp.apply_billing('evt_rollback_billing_applied',0,'free','canceled')='duplicate');
SELECT pg_temp.expect_billing_error('Stale observation cannot overwrite current entitlement',
 $q$SELECT pg_temp.apply_billing('evt_rollback_billing_stale',0,'free','canceled')$q$,'40001');
SELECT pg_temp.expect_billing_error('Malformed period fails without an acknowledged event',
 $q$SELECT pg_temp.apply_billing('evt_rollback_billing_invalid',1,'pro','active','invalid-timestamp')$q$,'22007');
SELECT pg_temp.assert_billing('Failed statements preserve plan revision and receipts',
 (SELECT plan='pro' FROM public.organizations WHERE id='91d90000-0000-4000-8000-000000000011')
 AND NOT EXISTS(SELECT 1 FROM public.billing_events WHERE stripe_event_id IN ('evt_rollback_billing_stale','evt_rollback_billing_invalid'))
 AND public.get_stripe_billing_snapshot('91d90000-0000-4000-8000-000000000011')->>'revision'='1');
SELECT pg_temp.assert_billing('Fresh cancellation removes paid entitlement',
 pg_temp.apply_billing('evt_rollback_billing_cancel',1,'free','canceled')='applied');
SELECT pg_temp.assert_billing('Cancellation is durable with its exact receipt',
 (SELECT plan='free' AND subscription_status='canceled' FROM public.organizations WHERE id='91d90000-0000-4000-8000-000000000011')
 AND (SELECT count(*)=1 FROM public.billing_events WHERE stripe_event_id='evt_rollback_billing_cancel')
 AND public.get_stripe_billing_snapshot('91d90000-0000-4000-8000-000000000011')->>'revision'='2');
SELECT pg_temp.expect_billing_error('Service role cannot read private synchronization rows directly',
 $q$SELECT * FROM private.stripe_billing_sync_state$q$,'42501');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"91d90000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_billing('Current workspace owner can read its two billing receipts',
 (SELECT count(*)=2 FROM public.billing_events WHERE org_id='91d90000-0000-4000-8000-000000000011'));
SELECT pg_temp.expect_billing_error('Workspace owner cannot grant a paid plan through ordinary updates',
 $q$UPDATE public.organizations SET plan='business' WHERE id='91d90000-0000-4000-8000-000000000011'$q$,'42501');
SELECT pg_temp.expect_billing_error('Workspace owner cannot manufacture a processed receipt',
 $q$INSERT INTO public.billing_events(stripe_event_id,type,org_id) VALUES('evt_rollback_billing_forged','customer.subscription.updated','91d90000-0000-4000-8000-000000000011')$q$,'42501');
SELECT pg_temp.expect_billing_error('Workspace owner cannot call the privileged billing snapshot',
 $q$SELECT public.get_stripe_billing_snapshot('91d90000-0000-4000-8000-000000000011')$q$,'42501');
SELECT pg_temp.expect_billing_error('Workspace owner cannot call the privileged billing writer',
 $q$SELECT pg_temp.apply_billing('evt_rollback_billing_forged_rpc',2)$q$,'42501');
SELECT pg_temp.expect_billing_error('Workspace owner cannot read private synchronization rows',
 $q$SELECT * FROM private.stripe_billing_sync_state$q$,'42501');
SELECT set_config('request.jwt.claims','{"sub":"91d90000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
SELECT pg_temp.assert_billing('Foreign workspace owner cannot read billing receipts',
 NOT EXISTS(SELECT 1 FROM public.billing_events WHERE org_id='91d90000-0000-4000-8000-000000000011'));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_billing_error('Anonymous caller cannot call the privileged snapshot',
 $q$SELECT public.get_stripe_billing_snapshot('91d90000-0000-4000-8000-000000000011')$q$,'42501');
SELECT pg_temp.expect_billing_error('Anonymous caller cannot call the privileged writer',
 $q$SELECT pg_temp.apply_billing('evt_rollback_billing_anon',2)$q$,'42501');
RESET ROLE;
SELECT pg_temp.assert_billing('Candidate functions pin empty search paths and exact service-role grants',
 (SELECT count(*)=2 AND bool_and(p.prosecdef AND 'search_path=""'=ANY(p.proconfig)
 AND has_function_privilege('service_role',p.oid,'execute') AND NOT has_function_privilege('authenticated',p.oid,'execute')
 AND NOT has_function_privilege('anon',p.oid,'execute'))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('apply_stripe_billing_event','get_stripe_billing_snapshot')));
SELECT count(*) AS passed,jsonb_agg(name ORDER BY name) AS checks FROM billing_acceptance_results;
ROLLBACK;
