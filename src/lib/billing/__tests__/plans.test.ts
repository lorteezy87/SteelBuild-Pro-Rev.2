// Billing entitlement logic — the plan resolver + limit math that gates a
// paying customer's projects/members. Pure functions, no mocks.

import { describe, it, expect } from "vitest";
import { PLANS, PLAN_BY_KEY, planFor, withinLimit, seatCapacity } from "@/lib/billing/plans";

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

describe("seatCapacity", () => {
  it("counts members + pending invites against a finite limit", () => {
    const cap = seatCapacity(3, 2, 15); // Pro
    expect(cap.used).toBe(5);
    expect(cap.members).toBe(3);
    expect(cap.pending).toBe(2);
    expect(cap.limit).toBe(15);
    expect(cap.remaining).toBe(10);
    expect(cap.unlimited).toBe(false);
    expect(cap.atLimit).toBe(false);
    expect(cap.near).toBe(false);
    expect(cap.pct).toBe(33);
  });

  it("flags atLimit when members + pending reach the limit (matches the invite gate)", () => {
    const cap = seatCapacity(1, 1, 2); // Free: 1 member + 1 pending = 2/2
    expect(cap.used).toBe(2);
    expect(cap.atLimit).toBe(true);
    expect(cap.remaining).toBe(0);
    expect(cap.pct).toBe(100);
  });

  it("flags near at ≥80% of a finite limit (but not yet at it)", () => {
    const cap = seatCapacity(12, 0, 15); // 12/15 = 80%
    expect(cap.near).toBe(true);
    expect(cap.atLimit).toBe(false);
  });

  it("treats a null limit as unlimited (no bar, no atLimit)", () => {
    const cap = seatCapacity(40, 5, null); // Business / Enterprise
    expect(cap.unlimited).toBe(true);
    expect(cap.limit).toBeNull();
    expect(cap.remaining).toBeNull();
    expect(cap.atLimit).toBe(false);
    expect(cap.near).toBe(false);
    expect(cap.pct).toBe(0);
    expect(cap.used).toBe(45);
  });

  it("caps pct at 100 when over the limit and never goes negative on remaining", () => {
    const cap = seatCapacity(20, 0, 15); // already over (e.g. after a downgrade)
    expect(cap.pct).toBe(100);
    expect(cap.remaining).toBe(0);
    expect(cap.atLimit).toBe(true);
  });

  it("is safe on junk counts", () => {
    const cap = seatCapacity(-3, NaN as unknown as number, 2);
    expect(cap.members).toBe(0);
    expect(cap.pending).toBe(0);
    expect(cap.used).toBe(0);
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
