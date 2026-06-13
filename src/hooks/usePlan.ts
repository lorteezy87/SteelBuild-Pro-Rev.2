/**
 * usePlan — the current org's plan + subscription status (entitlement read).
 * The plan key comes from organizations.plan, which only the billing webhook can
 * change (DB trigger), so it's a trustworthy entitlement anchor.
 */

import { useOrg } from "@/components/shared/OrgContext";
import { planFor } from "@/lib/billing/plans";

export function usePlan() {
  const { currentOrg } = useOrg();
  const planKey = currentOrg?.plan || "free";
  const status = currentOrg?.subscription_status || null;
  return {
    plan: planFor(planKey),
    planKey,
    status,
    isPaid: planKey !== "free",
    isActive: status === "active" || status === "trialing" || planKey === "enterprise",
    pastDue: status === "past_due",
  };
}
