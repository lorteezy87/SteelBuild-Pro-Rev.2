// Stripe webhook-replay test (#3 P0). Exercises the pure org-mapping logic the
// stripe-billing webhook applies for each Stripe event type, so a regression in
// "what plan/status does org X get for this event" fails CI. This is colocated
// with the edge function and runs under Vitest (vite.config.js `test` has no
// include restriction, only excludes — supabase/ is not excluded).
//
// Scope: this proves the handler's org-update computation (the most regression-
// prone part). It does NOT replace the owner-run test-mode E2E, which proves the
// real Stripe signature round-trip + DB write (see docs/stripe-go-live.md).

import { describe, it, expect } from "vitest";
import {
  priceToPlan,
  checkoutOrgUpdate,
  subscriptionOrgUpdate,
} from "../webhookLogic.ts";

const cfg = {
  pricePro: "price_pro_123",
  priceBusiness: "price_biz_456",
  webhookSecret: "whsec_test",
};

const CPE = 1893456000; // epoch seconds
const CPE_ISO = new Date(CPE * 1000).toISOString();

describe("priceToPlan", () => {
  it("maps the configured price ids and rejects everything else", () => {
    expect(priceToPlan("price_pro_123", cfg)).toBe("pro");
    expect(priceToPlan("price_biz_456", cfg)).toBe("business");
    expect(priceToPlan("price_unknown", cfg)).toBeNull();
    expect(priceToPlan(undefined, cfg)).toBeNull();
  });
});

describe("checkout.session.completed -> checkoutOrgUpdate", () => {
  it("derives plan from the subscription price and carries status/customer/period", () => {
    const sub = {
      id: "sub_1",
      status: "active",
      current_period_end: CPE,
      items: { data: [{ price: { id: "price_pro_123" } }] },
    };
    const session = { metadata: { org_id: "org_1" }, subscription: "sub_1", customer: "cus_1" };
    expect(checkoutOrgUpdate(session, sub, cfg)).toEqual({
      orgId: "org_1",
      update: {
        plan: "pro",
        subscription_status: "active",
        stripe_subscription_id: "sub_1",
        stripe_customer_id: "cus_1",
        current_period_end: CPE_ISO,
      },
    });
  });

  it("lets explicit metadata.plan win over the price-derived plan", () => {
    const sub = { status: "active", items: { data: [{ price: { id: "price_pro_123" } }] } };
    const res = checkoutOrgUpdate({ metadata: { org_id: "org_1", plan: "business" }, subscription: "sub_1" }, sub, cfg);
    expect(res?.update.plan).toBe("business");
  });

  it("falls back to client_reference_id for the org id, defaults plan=pro, status=active, period=null when no sub", () => {
    const res = checkoutOrgUpdate({ client_reference_id: "org_ref" }, null, cfg);
    expect(res?.orgId).toBe("org_ref");
    expect(res?.update.plan).toBe("pro");
    expect(res?.update.subscription_status).toBe("active");
    expect(res?.update.current_period_end).toBeNull();
  });

  it("returns null (no-op) when no org id is resolvable", () => {
    expect(checkoutOrgUpdate({ subscription: null, customer: null }, null, cfg)).toBeNull();
  });
});

describe("customer.subscription.* -> subscriptionOrgUpdate", () => {
  it("deleted -> free/canceled", () => {
    const sub = {
      id: "sub_9",
      status: "active",
      customer: "cus_1",
      current_period_end: CPE,
      items: { data: [{ price: { id: "price_pro_123" } }] },
    };
    expect(subscriptionOrgUpdate(sub, cfg, { deleted: true })).toEqual({
      plan: "free",
      subscription_status: "canceled",
      stripe_subscription_id: "sub_9",
      current_period_end: CPE_ISO,
    });
  });

  it("updated -> plan from price, live status, null period when absent", () => {
    const sub = {
      id: "sub_9",
      status: "past_due",
      items: { data: [{ price: { id: "price_biz_456" } }] },
      current_period_end: null,
    };
    expect(subscriptionOrgUpdate(sub, cfg, { deleted: false })).toEqual({
      plan: "business",
      subscription_status: "past_due",
      stripe_subscription_id: "sub_9",
      current_period_end: null,
    });
  });

  it("updated with an unknown price falls back to metadata.plan, else undefined", () => {
    const withMeta = subscriptionOrgUpdate(
      { id: "s", status: "active", metadata: { plan: "pro" }, items: { data: [{ price: { id: "price_x" } }] } },
      cfg,
      { deleted: false },
    );
    expect(withMeta.plan).toBe("pro");

    const noMeta = subscriptionOrgUpdate({ id: "s", status: "active", items: { data: [] } }, cfg, { deleted: false });
    expect(noMeta.plan).toBeUndefined();
  });
});
