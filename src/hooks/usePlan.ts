/**
 * usePlan — the current org's plan + subscription status (entitlement read).
 * The plan key comes from organizations.plan, which only the billing webhook can
 * change (DB trigger), so it's a trustworthy entitlement anchor.
 */

import { useOrg } from "@/components/shared/OrgContext";
import { planFor } from "@/lib/billing/plans";

export function usePlan() {
  const { currentOrg } = useOrg();
  // OrgContext.jsx is untyped JS, so currentOrg infers as `null`. Cast at the
  // boundary to the real org shape (drop once OrgContext is typed).
  const org = currentOrg as
    | { plan?: string | null; subscription_status?: string | null }
    | null;
  const planKey = org?.plan || "free";
  const status = org?.subscription_status || null;
  return {
    plan: planFor(planKey),
    planKey,
    status,
    isPaid: planKey !== "free",
    isActive: status === "active" || status === "trialing" || planKey === "enterprise",
    pastDue: status === "past_due",
  };
}
