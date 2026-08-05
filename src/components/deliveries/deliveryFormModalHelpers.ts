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
