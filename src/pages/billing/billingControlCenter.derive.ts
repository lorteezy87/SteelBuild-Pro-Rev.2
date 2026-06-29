/**
 * Pure derivations for the Billing Control Center (command_ui redesign).
 * No React, no network. All KPIs are derived from the real org subscription
 * fields exposed by OrgContext + usePlan — no invented invoice/AR data.
 *
 * Real org fields used:
 *   org.plan                  — "free" | "pro" | "business" | "enterprise"
 *   org.subscription_status   — Stripe status: "active" | "trialing" | "past_due" | null
 *   org.current_period_end    — ISO timestamp; renewal date for paid plans
 *   org.stripe_customer_id    — non-null = has ever had a Stripe customer
 * Real plan catalog used (from plans.ts):
 *   plan.name, plan.priceMonthly, plan.limits.projects, plan.limits.members
 */

import { planFor, seatCapacity } from "@/lib/billing/plans";
import type { Plan, SeatCapacity } from "@/lib/billing/plans";

/** Tones accepted by KpiStrip cells. */
export type BillingKpiTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface BillingSummaryInput {
  planKey: string | null | undefined;
  subscriptionStatus: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
  stripeCustomerId: string | null | undefined;
  /** Number of accepted workspace members (for seat-capacity KPI). */
  memberCount: number;
  /** Number of pending (not-yet-accepted) workspace invites. */
  pendingCount: number;
  /** Number of active projects in the workspace. */
  projectCount: number;
}

export interface BillingKpi {
  label: string;
  value: string;
  sublabel: string;
  tone: BillingKpiTone;
}

export interface BillingSummary {
  plan: Plan;
  planKey: string;
  /** Human-readable status label ("Active", "Trialing", "Past Due", "Free", "Enterprise"). */
  statusLabel: string;
  statusTone: BillingKpiTone;
  /** ISO date string "YYYY-MM-DD", or null for free/enterprise. */
  renewalDate: string | null;
  /** Days until renewal; null if not applicable or unparseable. */
  daysUntilRenewal: number | null;
  /** True if the Stripe subscription is in a healthy state. */
  isActive: boolean;
  /** True if past_due — needs user attention. */
  isPastDue: boolean;
  /** Whether the org has a Stripe customer record. */
  hasStripeCustomer: boolean;
  seats: SeatCapacity;
  projectLimit: number | null;
  projectCount: number;
  projectsUnlimited: boolean;
  /** KPI cells, ready to pass to KpiStrip. */
  kpis: BillingKpi[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a Stripe-era ISO timestamp or date string to "YYYY-MM-DD", or null. */
export function parseRenewalDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Support both "2026-09-01T00:00:00Z" and bare "2026-09-01"
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Whole days from today until `dateStr` (YYYY-MM-DD); null if missing or invalid. */
export function daysUntilDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function subscriptionStatusLabel(
  status: string | null | undefined,
  planKey: string,
): string {
  if (planKey === "enterprise") return "Enterprise";
  if (planKey === "free") return "Free";
  if (status === "active") return "Active";
  if (status === "trialing") return "Trialing";
  if (status === "past_due") return "Past Due";
  if (status === "canceled") return "Canceled";
  if (status === "unpaid") return "Unpaid";
  return "Free";
}

export function subscriptionStatusTone(
  status: string | null | undefined,
  planKey: string,
): BillingKpiTone {
  if (planKey === "enterprise") return "info";
  if (status === "active" || status === "trialing") return "good";
  if (status === "past_due" || status === "unpaid") return "danger";
  if (status === "canceled") return "warn";
  return "neutral"; // free
}

// ─── Main derivation ──────────────────────────────────────────────────────────

/**
 * Build all derived display values for the Billing Control Center from real org
 * subscription fields. Pure — no network, no side effects.
 */
export function buildBillingSummary(input: BillingSummaryInput): BillingSummary {
  const planKey = input.planKey || "free";
  const plan = planFor(planKey);
  const status = input.subscriptionStatus;
  const isActive =
    status === "active" || status === "trialing" || planKey === "enterprise";
  const isPastDue = status === "past_due";

  const statusLabel = subscriptionStatusLabel(status, planKey);
  const tone = subscriptionStatusTone(status, planKey);

  const renewalDate = parseRenewalDate(input.currentPeriodEnd);
  const daysUntilRenewal =
    planKey !== "free" && planKey !== "enterprise" ? daysUntilDate(renewalDate) : null;

  const seats = seatCapacity(
    input.memberCount,
    input.pendingCount,
    plan.limits.members,
  );
  const projectLimit = plan.limits.projects;
  const projectsUnlimited = projectLimit === null;

  // ─── KPI cells ────────────────────────────────────────────────────────────

  // 1. Plan tier
  const planKpi: BillingKpi = {
    label: "Plan",
    value: plan.name,
    sublabel: plan.priceMonthly > 0 ? `$${plan.priceMonthly}/mo` : "no charge",
    tone: planKey === "free" ? "neutral" : "good",
  };

  // 2. Subscription status
  const statusKpi: BillingKpi = {
    label: "Status",
    value: statusLabel,
    sublabel: isPastDue ? "payment required" : isActive ? "subscription healthy" : "no subscription",
    tone,
  };

  // 3. Renewal date (show only for paid plans with a known date)
  const renewalKpi: BillingKpi = (() => {
    if (!renewalDate || planKey === "free" || planKey === "enterprise") {
      return {
        label: "Renewal",
        value: "—",
        sublabel: planKey === "enterprise" ? "managed externally" : "no subscription",
        tone: "neutral" as BillingKpiTone,
      };
    }
    const days = daysUntilRenewal ?? 0;
    return {
      label: "Renewal",
      value: renewalDate,
      sublabel: days <= 0 ? "today" : `${days}d from now`,
      tone: (days <= 7 ? "warn" : "neutral") as BillingKpiTone,
    };
  })();

  // 4. Seat usage (members + pending vs limit)
  const seatKpi: BillingKpi = {
    label: "Seats Used",
    value: seats.unlimited ? `${seats.used}` : `${seats.used} / ${seats.limit}`,
    sublabel: seats.unlimited
      ? "unlimited members"
      : seats.atLimit
      ? "at member limit"
      : seats.near
      ? "near member limit"
      : `${seats.remaining} seats remaining`,
    tone: seats.atLimit ? "danger" : seats.near ? "warn" : "neutral",
  };

  // 5. Project usage
  const projectKpi: BillingKpi = {
    label: "Projects",
    value: projectsUnlimited ? `${input.projectCount}` : `${input.projectCount} / ${projectLimit}`,
    sublabel: projectsUnlimited
      ? "unlimited projects"
      : input.projectCount >= (projectLimit ?? 0)
      ? "at project limit"
      : `${(projectLimit ?? 0) - input.projectCount} remaining`,
    tone:
      !projectsUnlimited && input.projectCount >= (projectLimit ?? 0)
        ? "danger"
        : !projectsUnlimited && (projectLimit ?? 0) > 0 && input.projectCount / (projectLimit ?? 1) >= 0.8
        ? "warn"
        : "neutral",
  };

  const kpis: BillingKpi[] = [planKpi, statusKpi, renewalKpi, seatKpi, projectKpi];

  return {
    plan,
    planKey,
    statusLabel,
    statusTone: tone,
    renewalDate,
    daysUntilRenewal,
    isActive,
    isPastDue,
    hasStripeCustomer: !!input.stripeCustomerId,
    seats,
    projectLimit,
    projectCount: input.projectCount,
    projectsUnlimited,
    kpis,
  };
}
