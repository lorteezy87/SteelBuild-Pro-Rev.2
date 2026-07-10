/**
 * Billing — workspace plan + subscription (multi-tenant SaaS).
 *
 * Shows the current plan/status, the plan cards (upgrade → Stripe Checkout), and
 * a "Manage billing" link to the Stripe customer portal once subscribed. Plan
 * changes are applied by the webhook (organizations.plan), so after returning
 * from Checkout we refetch the org. Owner/admin only for the actions.
 *
 * command_ui flag: wraps the classic plan/cards UI in BillingControlCenter
 * (PageHero + KpiStrip) without changing any Stripe handler logic.
 */

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, CreditCard, ExternalLink, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/components/shared/OrgContext";
import { usePlan } from "@/hooks/usePlan";
import { PLANS } from "@/lib/billing/plans";
import { startCheckout, openBillingPortal } from "@/lib/billing/billingService";
import { CommandBar } from "@/components/design-system";
import { useFlag } from "@/hooks/useFeatureFlag";
import { isNativePlatform } from "@/lib/native/platform";
import BillingControlCenter from "./billing/BillingControlCenter";
import { listOrgMembers, listInvitations } from "@/lib/org/repository";
import { entities } from "@/api/supabaseClient";

export default function Billing() {
  const { currentOrg, currentRole, refetchOrgs } = useOrg();
  const { plan, planKey, status, isActive } = usePlan();
  const [busy, setBusy] = useState(null);
  const canManage = currentRole === "owner" || currentRole === "admin";
  const commandUi = useFlag("command_ui");
  // Native (App Store) build is sign-in only: no in-app purchase/checkout/portal
  // UI. Plans are managed on the web. Keep the read-only current-plan display.
  const native = isNativePlatform();
  const orgId = currentOrg?.id;

  // Returning from Checkout — the webhook flips the plan async, so refetch.
  useEffect(() => {
    let s = null;
    try { s = new URLSearchParams(window.location.search).get("status"); } catch { /* ignore */ }
    if (s === "success") {
      toast.success("Subscription active — thank you!");
      const t = setTimeout(() => refetchOrgs(), 1500);
      try { window.history.replaceState({}, "", "/Billing"); } catch { /* ignore */ }
      return () => clearTimeout(t);
    }
    if (s === "cancel") {
      toast.message("Checkout canceled");
      try { window.history.replaceState({}, "", "/Billing"); } catch { /* ignore */ }
    }
    return undefined;
  }, [refetchOrgs]);

  const upgrade = async (key) => {
    if (!currentOrg?.id || busy) return;
    setBusy(key);
    try {
      const url = await startCheckout(key, currentOrg.id);
      if (url) window.location.href = url;
      else throw new Error("No checkout URL returned");
    } catch (err) {
      toast.error(err?.message || "Couldn't start checkout — is billing configured?");
      setBusy(null);
    }
  };

  const manage = async () => {
    if (!currentOrg?.id || busy) return;
    setBusy("portal");
    try {
      const url = await openBillingPortal(currentOrg.id);
      if (url) window.location.href = url;
      else throw new Error("No portal URL");
    } catch (err) {
      toast.error(err?.message || "Couldn't open the billing portal");
      setBusy(null);
    }
  };

  // ── command_ui: fetch member + invite counts for the seat KPI ──────────────
  // Only fire when the flag is on to avoid unnecessary requests on the classic path.
  const { data: orgMembers = [] } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => listOrgMembers(orgId),
    enabled: commandUi && !!orgId,
    staleTime: 60_000,
  });
  const { data: orgInvites = [] } = useQuery({
    queryKey: ["org-invites", orgId],
    queryFn: () => listInvitations(orgId),
    enabled: commandUi && !!orgId,
    staleTime: 60_000,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    enabled: commandUi,
    staleTime: 5 * 60_000,
  });

  const memberCount = orgMembers.length;
  const pendingCount = useMemo(
    () => orgInvites.filter((i) => i.status === "pending").length,
    [orgInvites],
  );
  const projectCount = projects.length;

  // ── Classic plan UI (plan banner + cards + footer) ─────────────────────────
  // Extracted so it can be passed as children into BillingControlCenter without
  // duplicating any handler or hook logic.
  const classicContent = (
    <>
      {/* Current plan banner */}
      <div className="sbd-card" style={{ padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Current plan</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <span style={{ fontFamily: "'Space Grotesk', var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>{plan.name}</span>
            <StatusPill status={status} isActive={isActive} planKey={planKey} />
          </div>
          {currentOrg?.current_period_end && isActive && planKey !== "enterprise" && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Renews {String(currentOrg.current_period_end).slice(0, 10)}</div>
          )}
        </div>
        {canManage && currentOrg?.stripe_customer_id && !native && (
          <button className="sbd-btn sbd-btn-ghost" onClick={manage} disabled={busy === "portal"}>
            <CreditCard size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />{busy === "portal" ? "Opening…" : "Manage billing"} <ExternalLink size={12} style={{ verticalAlign: "-1px", marginLeft: 4 }} />
          </button>
        )}
      </div>

      {!canManage && !native && (
        <div className="sbd-card" style={{ padding: 14, color: "var(--text-muted)", fontSize: 13 }}>
          Only a workspace owner or admin can change the plan.
        </div>
      )}

      {/* Plan cards + checkout — hidden in the native (sign-in-only) build; the
          App Store app doesn't sell subscriptions, they're managed on the web. */}
      {native ? (
        <div className="sbd-card" style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.55 }}>
          Your subscription is managed on the web. Sign in at{" "}
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>steelbuild-pro.com</span>{" "}
          to view plans or change your subscription.
        </div>
      ) : (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {PLANS.map((p) => {
          const current = p.key === planKey;
          return (
            <div key={p.key} className={p.highlight ? "sbd-card-strong" : "sbd-card"}
              style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, border: current ? "1px solid var(--accent)" : undefined, position: "relative" }}>
              {p.highlight && !current && (
                <span style={{ position: "absolute", top: -9, right: 14, background: "var(--accent)", color: "var(--bg-base)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", padding: "3px 9px", borderRadius: 999 }}>
                  <Sparkles size={10} style={{ verticalAlign: "-1px", marginRight: 3 }} />POPULAR
                </span>
              )}
              <div>
                <div style={{ fontFamily: "'Space Grotesk', var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, minHeight: 32 }}>{p.blurb}</div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>${p.priceMonthly}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>/mo</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                {p.features.map((f) => (
                  <li key={f} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12.5, color: "var(--text-secondary)" }}>
                    <Check size={14} style={{ color: "var(--status-success)", flexShrink: 0, marginTop: 1 }} />{f}
                  </li>
                ))}
              </ul>
              {current ? (
                <button className="sbd-btn sbd-btn-ghost" disabled style={{ justifyContent: "center" }}>Current plan</button>
              ) : p.purchasable && canManage ? (
                <button className={p.highlight ? "sbd-btn sbd-btn-primary" : "sbd-btn sbd-btn-ghost"} style={{ justifyContent: "center" }} disabled={busy === p.key} onClick={() => upgrade(p.key)}>
                  {busy === p.key ? "Starting…" : planKey === "free" ? `Choose ${p.name}` : `Switch to ${p.name}`}
                </button>
              ) : !p.purchasable ? (
                <button className="sbd-btn sbd-btn-ghost" disabled style={{ justifyContent: "center" }}>{p.key === "free" ? "Free" : "—"}</button>
              ) : (
                <div style={{ height: 36 }} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        Secure payments by Stripe. Cancel anytime from Manage billing.
      </div>
      </>
      )}
    </>
  );

  // ── command_ui branch ──────────────────────────────────────────────────────
  if (commandUi) {
    return (
      <BillingControlCenter
        orgName={currentOrg?.name || "Workspace"}
        planKey={planKey}
        subscriptionStatus={status}
        currentPeriodEnd={currentOrg?.current_period_end ?? null}
        stripeCustomerId={currentOrg?.stripe_customer_id ?? null}
        memberCount={memberCount}
        pendingCount={pendingCount}
        projectCount={projectCount}
      >
        {classicContent}
      </BillingControlCenter>
    );
  }

  // ── Classic path (flag off) ────────────────────────────────────────────────
  return (
    <div className="sb-dashboard-reference-page page-content" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, maxWidth: 1000 }}>
      <CommandBar eyebrow={currentOrg?.name || "Workspace"} title="Billing & plan" subtitle="Your subscription powers this workspace" />
      {classicContent}
    </div>
  );
}

function StatusPill({ status, isActive, planKey }) {
  if (planKey === "enterprise") return <Pill tone="var(--accent)">Enterprise</Pill>;
  if (status === "past_due") return <Pill tone="var(--status-error)">Past due</Pill>;
  if (status === "trialing") return <Pill tone="var(--status-info)">Trial</Pill>;
  if (isActive) return <Pill tone="var(--status-success)">Active</Pill>;
  return <Pill>Free</Pill>;
}
function Pill({ children, tone }) {
  return (
    <span style={{ padding: "3px 10px", borderRadius: 999, border: `1px solid ${tone ? `color-mix(in srgb, ${tone} 40%, var(--border-default))` : "var(--border-default)"}`, background: "var(--bg-surface-low)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: tone || "var(--text-muted)", letterSpacing: "0.05em" }}>
      {children}
    </span>
  );
}
