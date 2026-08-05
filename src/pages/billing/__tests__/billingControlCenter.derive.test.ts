/**
 * Pure-derivation tests for buildBillingSummary — no React, no mocks.
 * Mirrors the test style from src/lib/billing/__tests__/plans.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  buildBillingSummary,
  parseRenewalDate,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from "../billingControlCenter.derive";

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe("parseRenewalDate", () => {
  it("parses a Stripe ISO timestamp to YYYY-MM-DD", () => {
    expect(parseRenewalDate("2026-09-01T00:00:00Z")).toBe("2026-09-01");
  });

  it("passes through a bare date string unchanged", () => {
    expect(parseRenewalDate("2026-09-15")).toBe("2026-09-15");
  });

  it("returns null for null, undefined, and unparseable values", () => {
    expect(parseRenewalDate(null)).toBeNull();
    expect(parseRenewalDate(undefined)).toBeNull();
    expect(parseRenewalDate("not-a-date")).toBeNull();
    expect(parseRenewalDate("")).toBeNull();
  });
});

describe("subscriptionStatusLabel", () => {
  it("maps known Stripe statuses", () => {
    expect(subscriptionStatusLabel("active", "pro")).toBe("Active");
    expect(subscriptionStatusLabel("trialing", "pro")).toBe("Trialing");
    expect(subscriptionStatusLabel("past_due", "pro")).toBe("Past Due");
    expect(subscriptionStatusLabel("canceled", "pro")).toBe("Canceled");
    expect(subscriptionStatusLabel("unpaid", "business")).toBe("Unpaid");
  });

  it("overrides status for free and enterprise plan keys", () => {
    expect(subscriptionStatusLabel("active", "free")).toBe("Free");
    expect(subscriptionStatusLabel("active", "enterprise")).toBe("Enterprise");
    expect(subscriptionStatusLabel(null, "free")).toBe("Free");
  });

  it("falls back to Free for unknown status + non-enterprise paid planKey", () => {
    expect(subscriptionStatusLabel(null, "pro")).toBe("Free");
  });
});

describe("subscriptionStatusTone", () => {
  it("returns good for active and trialing", () => {
    expect(subscriptionStatusTone("active", "pro")).toBe("good");
    expect(subscriptionStatusTone("trialing", "pro")).toBe("good");
  });

  it("returns danger for past_due and unpaid", () => {
    expect(subscriptionStatusTone("past_due", "pro")).toBe("danger");
    expect(subscriptionStatusTone("unpaid", "business")).toBe("danger");
  });

  it("returns warn for canceled", () => {
    expect(subscriptionStatusTone("canceled", "pro")).toBe("warn");
  });

  it("returns info for enterprise regardless of status", () => {
    expect(subscriptionStatusTone("active", "enterprise")).toBe("info");
  });

  it("returns neutral for free plan", () => {
    expect(subscriptionStatusTone(null, "free")).toBe("neutral");
  });
});

// ─── buildBillingSummary ──────────────────────────────────────────────────────

describe("buildBillingSummary — free plan", () => {
  const base = {
    planKey: "free",
    subscriptionStatus: null as string | null,
    currentPeriodEnd: null as string | null,
    stripeCustomerId: null as string | null,
    memberCount: 1,
    pendingCount: 0,
    projectCount: 1,
  };

  it("derives plan name and no-charge sublabel", () => {
    const s = buildBillingSummary(base);
    expect(s.plan.name).toBe("Free");
    expect(s.planKey).toBe("free");
    expect(s.kpis.find((k) => k.label === "Plan")?.sublabel).toBe("no charge");
  });

  it("is not active, has no stripe customer, renewal is null", () => {
    const s = buildBillingSummary(base);
    expect(s.isActive).toBe(false);
    expect(s.isPastDue).toBe(false);
    expect(s.hasStripeCustomer).toBe(false);
    expect(s.renewalDate).toBeNull();
    expect(s.daysUntilRenewal).toBeNull();
  });

  it("seat capacity uses free limit of 2", () => {
    const s = buildBillingSummary(base);
    expect(s.seats.limit).toBe(2);
    expect(s.seats.used).toBe(1);
    expect(s.seats.remaining).toBe(1);
    expect(s.seats.atLimit).toBe(false);
  });

  it("flags atLimit for seat KPI when both free seats are taken", () => {
    const s = buildBillingSummary({ ...base, memberCount: 1, pendingCount: 1 });
    expect(s.seats.atLimit).toBe(true);
    expect(s.kpis.find((k) => k.label === "Seats Used")?.tone).toBe("danger");
  });

  it("project limit is 1 and flags at-limit for project KPI when at 1", () => {
    const s = buildBillingSummary(base);
    expect(s.projectLimit).toBe(1);
    expect(s.kpis.find((k) => k.label === "Projects")?.tone).toBe("danger");
  });

  it("produces exactly 5 KPI cells", () => {
    const s = buildBillingSummary(base);
    expect(s.kpis).toHaveLength(5);
    const labels = s.kpis.map((k) => k.label);
    expect(labels).toEqual(["Plan", "Status", "Renewal", "Seats Used", "Projects"]);
  });
});

describe("buildBillingSummary — Pro active", () => {
  // A few days in the future — pick a fixed far-future date so the test doesn't
  // depend on today's wall-clock.
  const farFuture = "2099-12-31";
  const base = {
    planKey: "pro",
    subscriptionStatus: "active",
    currentPeriodEnd: farFuture,
    stripeCustomerId: "cus_abc123",
    memberCount: 8,
    pendingCount: 2,
    projectCount: 7,
  };

  it("is active and has a stripe customer", () => {
    const s = buildBillingSummary(base);
    expect(s.isActive).toBe(true);
    expect(s.hasStripeCustomer).toBe(true);
    expect(s.statusLabel).toBe("Active");
    expect(s.statusTone).toBe("good");
  });

  it("renewal date is parsed", () => {
    const s = buildBillingSummary(base);
    expect(s.renewalDate).toBe(farFuture);
  });

  it("seat usage: 8 members + 2 pending = 10 / 15, neutral tone", () => {
    const s = buildBillingSummary(base);
    expect(s.seats.used).toBe(10);
    expect(s.seats.limit).toBe(15);
    expect(s.seats.atLimit).toBe(false);
    expect(s.kpis.find((k) => k.label === "Seats Used")?.tone).toBe("neutral");
  });

  it("project usage: 7 / 10, near-limit (70%) → neutral (below 80%)", () => {
    const s = buildBillingSummary(base);
    expect(s.projectLimit).toBe(10);
    expect(s.kpis.find((k) => k.label === "Projects")?.tone).toBe("neutral");
  });

  it("near-seat-limit warning when ≥80%", () => {
    const s = buildBillingSummary({ ...base, memberCount: 12, pendingCount: 0 });
    // 12/15 = 80% → near = true
    expect(s.seats.near).toBe(true);
    expect(s.kpis.find((k) => k.label === "Seats Used")?.tone).toBe("warn");
  });
});

describe("buildBillingSummary — past_due plan", () => {
  const base = {
    planKey: "pro",
    subscriptionStatus: "past_due",
    currentPeriodEnd: "2026-07-01",
    stripeCustomerId: "cus_xyz",
    memberCount: 3,
    pendingCount: 0,
    projectCount: 2,
  };

  it("isPastDue and danger tone on status KPI", () => {
    const s = buildBillingSummary(base);
    expect(s.isPastDue).toBe(true);
    expect(s.isActive).toBe(false);
    expect(s.kpis.find((k) => k.label === "Status")?.tone).toBe("danger");
    expect(s.kpis.find((k) => k.label === "Status")?.sublabel).toMatch(/payment required/);
  });
});

describe("buildBillingSummary — enterprise", () => {
  const base = {
    planKey: "enterprise",
    subscriptionStatus: "active",
    currentPeriodEnd: null as string | null,
    stripeCustomerId: "cus_internal",
    memberCount: 50,
    pendingCount: 5,
    projectCount: 30,
  };

  it("enterprise is always active, unlimited, info tone", () => {
    const s = buildBillingSummary(base);
    expect(s.isActive).toBe(true);
    expect(s.seats.unlimited).toBe(true);
    expect(s.projectsUnlimited).toBe(true);
    expect(s.statusLabel).toBe("Enterprise");
    expect(s.statusTone).toBe("info");
  });

  it("renewal kpi shows managed externally", () => {
    const s = buildBillingSummary(base);
    expect(s.kpis.find((k) => k.label === "Renewal")?.sublabel).toBe("managed externally");
  });
});

describe("buildBillingSummary — business unlimited", () => {
  const base = {
    planKey: "business",
    subscriptionStatus: "active",
    currentPeriodEnd: "2099-01-01",
    stripeCustomerId: "cus_biz",
    memberCount: 40,
    pendingCount: 3,
    projectCount: 25,
  };

  it("seats and projects are unlimited", () => {
    const s = buildBillingSummary(base);
    expect(s.seats.unlimited).toBe(true);
    expect(s.projectsUnlimited).toBe(true);
    expect(s.kpis.find((k) => k.label === "Seats Used")?.tone).toBe("neutral");
    expect(s.kpis.find((k) => k.label === "Projects")?.tone).toBe("neutral");
  });
});
