-- LOCAL CANDIDATE: manual, reviewed application only; never db push/repair.
-- Deploy the matching stripe-billing handler only after this exact SQL is
-- applied and verified. It intentionally has no non-atomic fallback.
-- SBSEC-05/06: commit entitlement + event receipt together and fence provider
-- observations made before a competing worker changed the billing binding.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.stripe_billing_sync_state (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
ALTER TABLE private.stripe_billing_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.stripe_billing_sync_state FROM PUBLIC, anon, authenticated, service_role;

-- One statement gives a consistent organization/revision snapshot. No lock is
-- held while the Edge worker calls Stripe. JSON encodes bigint as text so a JS
-- number cannot round away the compare-and-set fence.
CREATE FUNCTION public.get_stripe_billing_snapshot(p_org_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'org_id', o.id,
    'revision', COALESCE(s.revision, 0)::text,
    'stripe_customer_id', o.stripe_customer_id,
    'stripe_subscription_id', o.stripe_subscription_id
  )
  FROM public.organizations o
  LEFT JOIN private.stripe_billing_sync_state s ON s.org_id = o.id
  WHERE o.id = p_org_id;
$$;
REVOKE ALL ON FUNCTION public.get_stripe_billing_snapshot(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_stripe_billing_snapshot(uuid) TO service_role;

CREATE FUNCTION public.apply_stripe_billing_event(
  p_event_id text,
  p_event_type text,
  p_org_id uuid,
  p_expected_revision bigint,
  p_expected_customer text,
  p_expected_subscription text,
  p_subscription_id text,
  p_customer_id text,
  p_subscription_created bigint,
  p_previous_subscription_created bigint,
  p_update jsonb
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  current_org public.organizations%ROWTYPE;
  current_revision bigint;
  changed_rows integer;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 1 AND 255
     OR p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'Invalid billing event identity' USING ERRCODE = '22023';
  END IF;
  -- Existing receipts, including rows written before this migration, remain
  -- authoritative. Do not reapply a historical event to initialize revision.
  IF EXISTS (SELECT 1 FROM public.billing_events WHERE stripe_event_id = p_event_id) THEN
    RETURN 'duplicate';
  END IF;
  IF p_org_id IS NULL THEN
    IF p_update IS NOT NULL THEN
      RAISE EXCEPTION 'Billing update requires an organization' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.billing_events(stripe_event_id, type, org_id) VALUES(p_event_id, p_event_type, NULL);
    RETURN 'ignored';
  END IF;

  -- Lock the organization before its dependent private row, matching erasure's
  -- parent->child lock order. Every webhook for an organization serializes here.
  SELECT * INTO current_org FROM public.organizations WHERE id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing organization does not exist' USING ERRCODE = 'P0002';
  END IF;
  -- A concurrent delivery may have completed while this worker waited.
  IF EXISTS (SELECT 1 FROM public.billing_events WHERE stripe_event_id = p_event_id) THEN
    RETURN 'duplicate';
  END IF;
  SELECT revision INTO current_revision FROM private.stripe_billing_sync_state WHERE org_id = p_org_id;
  current_revision := COALESCE(current_revision, 0);
  IF p_expected_revision IS NULL OR p_expected_revision <> current_revision
     OR p_expected_customer IS DISTINCT FROM current_org.stripe_customer_id
     OR p_expected_subscription IS DISTINCT FROM current_org.stripe_subscription_id THEN
    RAISE EXCEPTION 'Billing snapshot changed; retrieve provider state again' USING ERRCODE = '40001';
  END IF;
  IF p_customer_id IS NULL OR p_customer_id = '' OR p_subscription_id IS NULL OR p_subscription_id = ''
     OR (current_org.stripe_customer_id IS NOT NULL AND current_org.stripe_customer_id <> p_customer_id) THEN
    RAISE EXCEPTION 'Billing customer or subscription binding mismatch' USING ERRCODE = '22023';
  END IF;

  IF p_update IS NOT NULL THEN
    IF jsonb_typeof(p_update) <> 'object'
       OR NOT (p_update ?& ARRAY['plan','subscription_status','stripe_subscription_id','stripe_customer_id','current_period_end'])
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_update) key WHERE key <> ALL(ARRAY['plan','subscription_status','stripe_subscription_id','stripe_customer_id','current_period_end']))
       OR p_update->>'plan' IS NULL OR p_update->>'plan' NOT IN ('free','pro','business')
       OR COALESCE(p_update->>'subscription_status','') = ''
       OR p_update->>'stripe_subscription_id' IS DISTINCT FROM p_subscription_id
       OR p_update->>'stripe_customer_id' IS DISTINCT FROM p_customer_id
       OR (p_update->>'plan' <> 'free' AND p_update->>'subscription_status' NOT IN ('active','trialing','past_due')) THEN
      RAISE EXCEPTION 'Invalid billing entitlement update' USING ERRCODE = '22023';
    END IF;
    IF current_org.stripe_subscription_id IS NOT NULL AND current_org.stripe_subscription_id <> p_subscription_id THEN
      -- Only a freshly verified, strictly newer Checkout may replace a binding.
      -- updated/deleted events for old subscriptions never own the new plan.
      IF p_event_type <> 'checkout.session.completed' OR p_subscription_created IS NULL
         OR p_previous_subscription_created IS NULL OR p_previous_subscription_created <= 0
         OR p_subscription_created <= p_previous_subscription_created THEN
        RAISE EXCEPTION 'Unproved replacement subscription order' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF p_event_type NOT IN ('checkout.session.completed','customer.subscription.updated','customer.subscription.deleted') THEN
      RAISE EXCEPTION 'Unsupported billing mutation event' USING ERRCODE = '22023';
    END IF;
    IF p_event_type = 'customer.subscription.deleted' AND (p_update->>'plan' <> 'free' OR p_update->>'subscription_status' <> 'canceled') THEN
      RAISE EXCEPTION 'Deleted subscription cannot retain paid entitlement' USING ERRCODE = '22023';
    END IF;
    UPDATE public.organizations SET
      plan = p_update->>'plan',
      subscription_status = p_update->>'subscription_status',
      stripe_subscription_id = p_subscription_id,
      stripe_customer_id = p_customer_id,
      current_period_end = (p_update->>'current_period_end')::timestamptz
    WHERE id = p_org_id;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    IF changed_rows <> 1 THEN
      RAISE EXCEPTION 'Billing organization update did not apply' USING ERRCODE = '40001';
    END IF;
  END IF;
  INSERT INTO private.stripe_billing_sync_state(org_id, revision) VALUES(p_org_id, current_revision + 1)
    ON CONFLICT (org_id) DO UPDATE SET revision = EXCLUDED.revision;
  -- Any failure here rolls back the organization and revision. A unique event
  -- collision also rolls back; callers may confirm this exact receipt on 23505.
  INSERT INTO public.billing_events(stripe_event_id, type, org_id) VALUES(p_event_id, p_event_type, p_org_id);
  RETURN CASE WHEN p_update IS NULL THEN 'ignored' ELSE 'applied' END;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_stripe_billing_event(text,text,uuid,bigint,text,text,text,text,bigint,bigint,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_billing_event(text,text,uuid,bigint,text,text,text,text,bigint,bigint,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
