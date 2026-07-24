import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/billing/plans";

describe("landing pricing honesty", () => {
  it("publishes workspace seat-capped plans, not per-user multipliers", () => {
    const pro = PLANS.find((plan) => plan.key === "pro");
    const business = PLANS.find((plan) => plan.key === "business");
    expect(pro?.priceMonthly).toBe(99);
    expect(pro?.limits.members).toBe(15);
    expect(business?.priceMonthly).toBe(299);
    // Guard against reintroducing "/user" framing without changing plan semantics.
    expect(pro?.features.some((feature) => /per user/i.test(feature))).toBe(false);
  });
});
