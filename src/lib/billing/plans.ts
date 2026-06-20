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

export interface SeatCapacity {
  /** Accepted members + still-pending invites — what counts against the limit. */
  used: number;
  members: number;
  pending: number;
  /** Plan member limit; null = unlimited (Business / Enterprise). */
  limit: number | null;
  unlimited: boolean;
  /** Seats left before the limit; null when unlimited. */
  remaining: number | null;
  /** Used / limit as a 0–100 bar percentage (0 when unlimited). */
  pct: number;
  atLimit: boolean;
  /** ≥ 80% of a finite limit (and not yet at it) — worth a heads-up. */
  near: boolean;
}

/**
 * Workspace seat usage for the capacity meter. Counts accepted members PLUS
 * still-pending invites against the plan member limit — matching the server
 * invite gate (enforce_org_invite_limit counts members + pending), so the UI
 * can't promise a seat the gate will reject. `limit === null` = unlimited.
 */
export function seatCapacity(
  members: number,
  pending: number,
  limit: number | null,
): SeatCapacity {
  const m = Math.max(0, Math.floor(members || 0));
  const p = Math.max(0, Math.floor(pending || 0));
  const used = m + p;
  const unlimited = limit === null || limit === undefined;
  const lim = unlimited ? null : (limit as number);
  return {
    used,
    members: m,
    pending: p,
    limit: lim,
    unlimited,
    remaining: lim === null ? null : Math.max(0, lim - used),
    pct: lim === null ? 0 : Math.min(100, Math.round((used / Math.max(1, lim)) * 100)),
    atLimit: lim !== null && used >= lim,
    near: lim !== null && used < lim && used / lim >= 0.8,
  };
}
