-- Reviewed candidate: file-first manual apply/stamp only. Never db push/repair.
-- Requires 20261008071019; preserve that atomic-event migration unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE private.billing_checkout_intents (
 org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 plan text NOT NULL CHECK(plan IN ('pro','business')),
 price_id text NOT NULL CHECK(length(price_id) BETWEEN 1 AND 255),
 livemode boolean NOT NULL,
 return_base text NOT NULL CHECK(return_base ~ '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','open','expired')),
 customer_id text,
 session_id text,
 session_url text,
 session_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((session_id IS NULL AND session_url IS NULL AND session_expires_at IS NULL)
    OR (session_id IS NOT NULL AND session_url IS NOT NULL AND session_expires_at IS NOT NULL AND customer_id IS NOT NULL)),
 CHECK(state='pending' OR session_id IS NOT NULL)
);
ALTER TABLE private.billing_checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.billing_checkout_intents FROM PUBLIC,anon,authenticated,service_role;

-- Every writer locks organization before intent, matching cascading erasure.
-- The actor is supplied by the verified Edge caller, never browser input.
CREATE FUNCTION private.lock_checkout_organization(p_org uuid,p_actor uuid)
RETURNS public.organizations LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$ DECLARE v_org public.organizations%ROWTYPE; BEGIN
 SELECT * INTO v_org FROM public.organizations WHERE id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace no longer exists' USING ERRCODE='P0002'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE org_id=p_org AND user_id=p_actor AND role IN ('owner','admin')) THEN
  RAISE EXCEPTION 'Current workspace billing administrator required' USING ERRCODE='42501';
 END IF;
 RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION private.lock_checkout_organization(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.checkout_decision(p_org public.organizations)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=''
AS $$ SELECT CASE
 WHEN p_org.stripe_subscription_id IS NOT NULL AND p_org.stripe_customer_id IS NULL THEN 'reconcile'
 WHEN p_org.plan IS DISTINCT FROM 'free' THEN CASE WHEN p_org.stripe_customer_id IS NULL THEN 'reconcile' ELSE 'portal' END
 WHEN p_org.stripe_subscription_id IS NOT NULL AND (p_org.subscription_status IS NULL OR p_org.subscription_status NOT IN ('canceled','incomplete_expired')) THEN 'portal'
 WHEN p_org.stripe_subscription_id IS NULL AND p_org.subscription_status IS NOT NULL AND p_org.subscription_status NOT IN ('canceled','incomplete_expired') THEN 'reconcile'
 ELSE 'intent' END $$;
REVOKE ALL ON FUNCTION private.checkout_decision(public.organizations) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.begin_billing_checkout(p_org_id uuid,p_actor_id uuid,p_plan text,p_price_id text,p_livemode boolean,p_return_base text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_org public.organizations%ROWTYPE; v_intent private.billing_checkout_intents%ROWTYPE; v_decision text; BEGIN
 SELECT * INTO v_org FROM private.lock_checkout_organization(p_org_id,p_actor_id);
 v_decision:=private.checkout_decision(v_org);
 IF v_decision<>'intent' THEN RETURN jsonb_build_object('decision',v_decision); END IF;
 IF p_plan IS NULL OR p_plan NOT IN ('pro','business') OR p_price_id IS NULL OR length(p_price_id) NOT BETWEEN 1 AND 255
    OR p_livemode IS NULL OR p_return_base IS NULL OR p_return_base !~ '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
  RAISE EXCEPTION 'Invalid checkout configuration' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_intent FROM private.billing_checkout_intents WHERE org_id=p_org_id FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO private.billing_checkout_intents(org_id,plan,price_id,livemode,return_base,customer_id)
  VALUES(p_org_id,p_plan,p_price_id,p_livemode,p_return_base,v_org.stripe_customer_id) RETURNING * INTO v_intent;
 ELSIF v_intent.state='expired' THEN
  UPDATE private.billing_checkout_intents SET operation_id=gen_random_uuid(),plan=p_plan,price_id=p_price_id,
   livemode=p_livemode,return_base=p_return_base,state='pending',customer_id=v_org.stripe_customer_id,
   session_id=NULL,session_url=NULL,session_expires_at=NULL,created_at=clock_timestamp()
   WHERE org_id=p_org_id RETURNING * INTO v_intent;
 END IF;
 IF v_intent.customer_id IS DISTINCT FROM v_org.stripe_customer_id OR v_intent.livemode IS DISTINCT FROM p_livemode THEN
  RETURN jsonb_build_object('decision','reconcile');
 END IF;
 IF v_intent.session_id IS NULL AND v_intent.created_at<=clock_timestamp()-interval '23 hours' THEN
  RETURN jsonb_build_object('decision','reconcile');
 END IF;
 RETURN jsonb_build_object('decision','intent','intent',to_jsonb(v_intent));
END $$;
REVOKE ALL ON FUNCTION public.begin_billing_checkout(uuid,uuid,text,text,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_billing_checkout(uuid,uuid,text,text,boolean,text) TO service_role;

CREATE FUNCTION public.bind_billing_checkout_customer(p_org_id uuid,p_actor_id uuid,p_operation_id uuid,p_customer_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_org public.organizations%ROWTYPE; v_intent private.billing_checkout_intents%ROWTYPE; BEGIN
 SELECT * INTO v_org FROM private.lock_checkout_organization(p_org_id,p_actor_id);
 SELECT * INTO v_intent FROM private.billing_checkout_intents WHERE org_id=p_org_id FOR UPDATE;
 IF NOT FOUND OR v_intent.operation_id IS DISTINCT FROM p_operation_id OR v_intent.state='expired'
    OR v_intent.created_at<=clock_timestamp()-interval '23 hours' OR private.checkout_decision(v_org)<>'intent' THEN
  RAISE EXCEPTION 'Checkout operation changed or requires reconciliation' USING ERRCODE='40001';
 END IF;
 IF p_customer_id IS NULL OR length(p_customer_id) NOT BETWEEN 1 AND 255
    OR (v_org.stripe_customer_id IS NOT NULL AND v_org.stripe_customer_id<>p_customer_id)
    OR (v_intent.customer_id IS NOT NULL AND v_intent.customer_id<>p_customer_id) THEN
  RAISE EXCEPTION 'Checkout customer binding mismatch' USING ERRCODE='22023';
 END IF;
 -- A slower duplicate provider response may arrive after another request has
 -- already saved the same session. Confirm that exact binding without rewriting.
 IF v_intent.state='open' THEN RETURN; END IF;
 UPDATE public.organizations SET stripe_customer_id=p_customer_id WHERE id=p_org_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Checkout customer binding did not apply' USING ERRCODE='40001'; END IF;
 UPDATE private.billing_checkout_intents SET customer_id=p_customer_id WHERE org_id=p_org_id;
END $$;
REVOKE ALL ON FUNCTION public.bind_billing_checkout_customer(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bind_billing_checkout_customer(uuid,uuid,uuid,text) TO service_role;

CREATE FUNCTION public.record_billing_checkout_session(p_org_id uuid,p_actor_id uuid,p_operation_id uuid,p_customer_id text,p_session_id text,p_session_url text,p_expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_org public.organizations%ROWTYPE; v_intent private.billing_checkout_intents%ROWTYPE; BEGIN
 SELECT * INTO v_org FROM private.lock_checkout_organization(p_org_id,p_actor_id);
 SELECT * INTO v_intent FROM private.billing_checkout_intents WHERE org_id=p_org_id FOR UPDATE;
 IF NOT FOUND OR v_intent.operation_id IS DISTINCT FROM p_operation_id OR v_intent.state='expired'
    OR private.checkout_decision(v_org)<>'intent' OR (v_intent.session_id IS NULL AND v_intent.created_at<=clock_timestamp()-interval '23 hours') THEN
  RAISE EXCEPTION 'Checkout operation changed or requires reconciliation' USING ERRCODE='40001';
 END IF;
 IF p_customer_id IS NULL OR p_customer_id IS DISTINCT FROM v_org.stripe_customer_id OR p_customer_id IS DISTINCT FROM v_intent.customer_id
    OR p_session_id IS NULL OR length(p_session_id) NOT BETWEEN 1 AND 255 OR p_session_url IS NULL
    OR p_session_url !~ '^https://checkout[.]stripe[.]com/' OR p_expires_at IS NULL OR p_expires_at<=clock_timestamp()
    OR p_expires_at>clock_timestamp()+interval '25 hours'
    OR (v_intent.session_id IS NOT NULL AND (v_intent.session_id<>p_session_id OR v_intent.session_url<>p_session_url OR v_intent.session_expires_at<>p_expires_at)) THEN
  RAISE EXCEPTION 'Checkout session binding mismatch' USING ERRCODE='22023';
 END IF;
 UPDATE private.billing_checkout_intents SET state='open',session_id=p_session_id,session_url=p_session_url,session_expires_at=p_expires_at WHERE org_id=p_org_id;
END $$;
REVOKE ALL ON FUNCTION public.record_billing_checkout_session(uuid,uuid,uuid,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_billing_checkout_session(uuid,uuid,uuid,text,text,text,timestamptz) TO service_role;

-- Only the verified Edge provider read may attest expiry. Elapsed local time
-- alone never renews a pending/unknown outcome or a completed payment session.
CREATE FUNCTION public.expire_billing_checkout_intent(p_org_id uuid,p_actor_id uuid,p_operation_id uuid,p_session_id text,p_expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_org public.organizations%ROWTYPE; v_intent private.billing_checkout_intents%ROWTYPE; BEGIN
 SELECT * INTO v_org FROM private.lock_checkout_organization(p_org_id,p_actor_id);
 SELECT * INTO v_intent FROM private.billing_checkout_intents WHERE org_id=p_org_id FOR UPDATE;
 IF NOT FOUND OR v_intent.operation_id IS DISTINCT FROM p_operation_id OR v_intent.session_id IS DISTINCT FROM p_session_id
    OR v_intent.state<>'open' OR p_expires_at IS DISTINCT FROM v_intent.session_expires_at OR p_expires_at>clock_timestamp()
    OR v_intent.customer_id IS DISTINCT FROM v_org.stripe_customer_id
    OR private.checkout_decision(v_org)<>'intent' THEN
  RAISE EXCEPTION 'Checkout expiry could not be verified' USING ERRCODE='40001';
 END IF;
 UPDATE private.billing_checkout_intents SET state='expired' WHERE org_id=p_org_id;
END $$;
REVOKE ALL ON FUNCTION public.expire_billing_checkout_intent(uuid,uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.expire_billing_checkout_intent(uuid,uuid,uuid,text,timestamptz) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
