/**
 * plans.ts — the subscription plan catalog (multi-tenant SaaS billing).
 *
 * Display + entitlement metadata only. The actual Stripe price IDs live in the
 * stripe-billing edge function's env (STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS),
 * so the client only ever passes a plan KEY — never a price id. Edit the display
 * prices here to match what you set in Stripe.
 */

export interface Plan {
  key: string;
  name: string;
  priceMonthly: number; // display only ($/mo); 0 = free
  blurb: string;
  limits: { projects: number | null; members: number | null }; // null = unlimited
  features: string[];
  purchasable: boolean; // false = free / internal / contact-sales
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    priceMonthly: 0,
    blurb: "Kick the tires on one project.",
    limits: { projects: 1, members: 2 },
    purchasable: false,
    features: ["1 project", "2 members", "Drawings, submittals & RFIs", "Tekla EPM / drawing-log imports"],
  },
  {
    key: "pro",
    name: "Pro",
    priceMonthly: 99,
    blurb: "The full killer workflow for a working shop.",
    limits: { projects: 10, members: 15 },
    purchasable: true,
    highlight: true,
    features: [
      "Up to 10 projects",
      "Up to 15 members",
      "Everything in Free",
      "Fab release + production status",
      "Pay apps, backcharges, deliveries",
      "Field Today + offline capture",
    ],
  },
  {
    key: "business",
    name: "Business",
    priceMonthly: 299,
    blurb: "Unlimited scale across the whole operation.",
    limits: { projects: null, members: null },
    purchasable: true,
    features: ["Unlimited projects & members", "Everything in Pro", "All modules", "Priority support"],
  },
];

export const PLAN_BY_KEY: Record<string, Plan> = Object.fromEntries(PLANS.map((p) => [p.key, p]));

/** Resolve an org's stored plan key to a Plan (enterprise = internal/ungated). */
export function planFor(planKey: string | null | undefined): Plan {
  if (planKey === "enterprise") {
    return {
      key: "enterprise", name: "Enterprise", priceMonthly: 0, purchasable: false,
      blurb: "Internal / custom.", limits: { projects: null, members: null }, features: ["Unlimited everything"],
    };
  }
  return PLAN_BY_KEY[planKey || "free"] || PLAN_BY_KEY.free;
}

/** Within a plan's limit? (null limit = unlimited.) */
export function withinLimit(limit: number | null, count: number): boolean {
  return limit === null || count < limit;
}
