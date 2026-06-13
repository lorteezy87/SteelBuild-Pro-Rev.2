// Billing entitlement logic — the plan resolver + limit math that gates a
// paying customer's projects/members. Pure functions, no mocks.

import { describe, it, expect } from "vitest";
import { PLANS, PLAN_BY_KEY, planFor, withinLimit } from "@/lib/billing/plans";

describe("planFor", () => {
  it("resolves a known plan key", () => {
    expect(planFor("pro").name).toBe("Pro");
    expect(planFor("business").limits).toEqual({ projects: null, members: null });
  });

  it("falls back to Free for missing / unknown keys (never throws, never undefined)", () => {
    for (const key of [null, undefined, "", "garbage", "PRO"]) {
      expect(planFor(key as string | null | undefined).key).toBe("free");
    }
  });

  it("treats enterprise as internal/ungated (unlimited, not purchasable)", () => {
    const ent = planFor("enterprise");
    expect(ent.key).toBe("enterprise");
    expect(ent.purchasable).toBe(false);
    expect(ent.limits).toEqual({ projects: null, members: null });
  });
});

describe("withinLimit", () => {
  it("treats a null limit as unlimited", () => {
    expect(withinLimit(null, 0)).toBe(true);
    expect(withinLimit(null, 100_000)).toBe(true);
  });

  it("allows adding while under the limit and blocks at/over it", () => {
    expect(withinLimit(1, 0)).toBe(true); // Free: 0 projects → can add the 1st
    expect(withinLimit(1, 1)).toBe(false); // Free: at 1 project → 2nd blocked
    expect(withinLimit(10, 9)).toBe(true); // Pro: room for the 10th
    expect(withinLimit(10, 10)).toBe(false); // Pro: at 10 → 11th blocked
  });
});

describe("PLANS catalog", () => {
  it("keeps the purchasable/highlight invariants the Billing UI relies on", () => {
    expect(PLAN_BY_KEY.free.purchasable).toBe(false);
    expect(PLAN_BY_KEY.pro.purchasable).toBe(true);
    expect(PLAN_BY_KEY.business.purchasable).toBe(true);
    expect(PLANS.filter((p) => p.highlight).map((p) => p.key)).toEqual(["pro"]);
  });

  it("every plan has the fields the UI reads", () => {
    for (const p of PLANS) {
      expect(typeof p.name).toBe("string");
      expect(typeof p.priceMonthly).toBe("number");
      expect(p.limits).toHaveProperty("projects");
      expect(p.limits).toHaveProperty("members");
      expect(Array.isArray(p.features)).toBe(true);
    }
  });
});
