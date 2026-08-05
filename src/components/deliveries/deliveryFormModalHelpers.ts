/**
 * Pure helpers for DeliveryFormModal.
 */

export const DELIVERY_FORM_STATUSES = [
  "Scheduled",
  "In Transit",
  "Delivered",
  "Partial",
  "Rejected",
  "Delayed",
] as const;

export const DELIVERY_PHASE_RANK: Record<string, number> = {
  Detailing: 0,
  Fabrication: 1,
  Delivery: 2,
  Erection: 3,
};

export function isWorkPackageFabComplete(wp: {
  phase?: string | null;
  status?: string | null;
} | null | undefined): boolean {
  if (!wp) return true;
  const rank = DELIVERY_PHASE_RANK[wp.phase || ""] ?? 0;
  if (rank >= 2) return true;
  if (rank === 1 && wp.status === "Complete") return true;
  return false;
}

export const DELIVERY_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};

export const DELIVERY_INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "10px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};
