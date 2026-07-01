/**
 * BillingControlCenter — light Command UI skin for the Billing page.
 *
 * Renders behind the `command_ui` feature flag. The classic Billing page
 * (plan cards + portal/checkout actions) is composed BELOW the hero and KPI
 * strip so ALL existing handlers are unchanged. This component is purely
 * presentational — it adds a hero header and a KPI strip; every Stripe
 * action still lives in the classic components passed as `children`.
 *
 * Real data only:
 *   - Plan name, price, status from usePlan / organizations.plan
 *   - Subscription status from organizations.subscription_status
 *   - Renewal from organizations.current_period_end
 *   - Seat usage from org members + pending invites
 *   - Project count from the project list
 *
 * NOT built (mockup mismatch):
 *   - Invoice list / AR aging — no invoices table in the DB schema.
 *     If this is ever needed, implement it via Stripe Billing portal
 *     (already linked via "Manage billing") or a new invoices edge function.
 */

import { useMemo } from "react";
import { CreditCard } from "lucide-react";
import "@/styles/command.css";
import { PageHero, KpiStrip, useCommandSkin } from "@/components/command";
import type { KpiCellDef } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import { buildBillingSummary } from "./billingControlCenter.derive";

// Icon imports matched to the KPI meaning — lucide-react (already a dep).
import {
  Layers,
  Activity,
  CalendarClock,
  Users,
  FolderKanban,
} from "lucide-react";

export interface BillingControlCenterProps {
  /** Workspace / org display name (from OrgContext). */
  orgName: string;
  /** Plan key: "free" | "pro" | "business" | "enterprise". */
  planKey: string | null | undefined;
  /** Stripe subscription_status from organizations row. */
  subscriptionStatus: string | null | undefined;
  /** organizations.current_period_end (ISO timestamp or null). */
  currentPeriodEnd: string | null | undefined;
  /** organizations.stripe_customer_id (non-null = portal available). */
  stripeCustomerId: string | null | undefined;
  /** Accepted member count for the workspace (used in seat KPI). */
  memberCount: number;
  /** Pending invite count (counts against seat limit per the server gate). */
  pendingCount: number;
  /** Active project count in this workspace. */
  projectCount: number;
  /**
   * The classic Billing UI — plan cards, portal button, checkout CTA — is
   * passed as children so it renders below the hero and KPIs completely
   * unchanged. No handler logic moves here.
   */
  children: React.ReactNode;
}

/** Tone → CSS class suffix for the KpiStrip icon tint. */
const TONE_ICONS = {
  Plan: Layers,
  Status: Activity,
  Renewal: CalendarClock,
  "Seats Used": Users,
  Projects: FolderKanban,
} as const;

export default function BillingControlCenter(props: BillingControlCenterProps) {
  const {
    orgName,
    planKey,
    subscriptionStatus,
    currentPeriodEnd,
    stripeCustomerId,
    memberCount,
    pendingCount,
    projectCount,
    children,
  } = props;

  useCommandSkin();

  const s = useMemo(
    () =>
      buildBillingSummary({
        planKey,
        subscriptionStatus,
        currentPeriodEnd,
        stripeCustomerId,
        memberCount,
        pendingCount,
        projectCount,
      }),
    [planKey, subscriptionStatus, currentPeriodEnd, stripeCustomerId, memberCount, pendingCount, projectCount],
  );

  const heroChips = [
    { label: s.plan.name },
    { label: s.statusLabel, tone: s.statusTone === "good" ? ("good" as const) : undefined },
    ...(s.isPastDue ? [{ label: "Payment required" }] : []),
  ];

  const kpiCells: KpiCellDef[] = s.kpis.map((kpi) => ({
    label: kpi.label,
    value: kpi.value,
    sublabel: kpi.sublabel,
    tone: kpi.tone,
    Icon: TONE_ICONS[kpi.label as keyof typeof TONE_ICONS] ?? CreditCard,
  }));

  return (
    <div className="billing-cc">
      <PageHero
        Icon={CreditCard}
        title="Billing"
        subtitle="Manage your workspace subscription, seats, and plan limits."
        projectName={orgName}
        chips={heroChips}
        photoSrc={photoFor("Billing") ?? undefined}
        stats={[]}
      />

      <KpiStrip cells={kpiCells} />

      {/*
        Classic billing UI: plan cards (upgrade/downgrade via Stripe Checkout)
        and the Manage Billing portal link. No handlers are altered — the parent
        Billing.jsx mounts these below the hero/KPIs when commandUi is true.
        CSS WANTS (add to command.css or a billing-specific sheet if the
        coordinator wants a named class without inline styles):
          .billing-cc__classic { display: flex; flex-direction: column; gap: 18px; max-width: 1000px; }
      */}
      <div className="billing-cc__classic" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1000 }}>
        {children}
      </div>
    </div>
  );
}
