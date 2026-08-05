/**
 * Pure style maps + lookup helpers for Integrations page.
 * Icon map stays in UI (React components).
 */
import { customerStatusMeta } from "@/lib/integrationCatalog";

export const STATUS_STYLES = {
  "Partially Live": { color: "var(--success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  Planned: { color: "var(--warning)", bg: "var(--warning-muted)", border: "var(--warning-border)" },
  "Adapter Required": { color: "var(--info)", bg: "var(--info-muted)", border: "var(--info-border)" },
};

// Customer-facing readiness tones → SteelBuild Dark tokens.
export const CUSTOMER_TONE_STYLES = {
  success: { color: "var(--success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  info: { color: "var(--info)", bg: "var(--info-muted)", border: "var(--info-border)" },
  warning: { color: "var(--warning)", bg: "var(--warning-muted)", border: "var(--warning-border)" },
  muted: { color: "var(--text-muted)", bg: "var(--bg-surface-high)", border: "var(--border-default)" },
};

export function customerToneStyle(statusKey: string | null | undefined) {
  return CUSTOMER_TONE_STYLES[customerStatusMeta(statusKey).tone] || CUSTOMER_TONE_STYLES.muted;
}

export const QUICK_LINKS = [
  { label: "Documents", page: "Documents" },
  { label: "Schedule", page: "Schedule" },
  { label: "RFIs", page: "RFIs" },
  { label: "Change Orders", page: "ChangeOrders" },
];

export function statusStyle(status: string | null | undefined) {
  return STATUS_STYLES[status as string] || STATUS_STYLES.Planned;
}
