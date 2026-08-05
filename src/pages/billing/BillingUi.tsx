/**
 * Presentational chips for Billing page shell.
 */
import type { ReactNode } from "react";

export function BillingPill({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${
          tone
            ? `color-mix(in srgb, ${tone} 40%, var(--border-default))`
            : "var(--border-default)"
        }`,
        background: "var(--bg-surface-low)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 700,
        color: tone || "var(--text-muted)",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </span>
  );
}

export function BillingStatusPill({
  status,
  isActive,
  planKey,
}: {
  status?: string | null;
  isActive?: boolean;
  planKey?: string | null;
}) {
  if (planKey === "enterprise") return <BillingPill tone="var(--accent)">Enterprise</BillingPill>;
  if (status === "past_due") return <BillingPill tone="var(--status-error)">Past due</BillingPill>;
  if (status === "trialing") return <BillingPill tone="var(--status-info)">Trial</BillingPill>;
  if (isActive) return <BillingPill tone="var(--status-success)">Active</BillingPill>;
  return <BillingPill>Free</BillingPill>;
}
