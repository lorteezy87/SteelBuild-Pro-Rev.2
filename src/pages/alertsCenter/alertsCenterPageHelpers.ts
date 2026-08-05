/** Pure helpers for AlertsCenter page shell. */

export const ALERT_PAGE_MAP: Record<string, string> = {
  RFI: "RFIs",
  RFI_Overdue: "RFIs",
  Drawing: "Drawings",
  ChangeOrder: "ChangeOrders",
  Delivery: "Deliveries",
  WorkPackage: "WorkPackages",
  ActionItem: "ActionItems",
};

export const SEVERITY_BG: Record<string, { bg: string; border: string }> = {
  Critical: { bg: "var(--danger-muted)", border: "var(--status-error)" },
  High: { bg: "var(--warning-muted)", border: "var(--status-warning)" },
  Medium: { bg: "var(--warning-muted)", border: "var(--status-warning)" },
  Low: { bg: "var(--hover-bg)", border: "var(--border-strong)" },
};

export type AlertLike = {
  is_dismissed?: boolean | null;
  severity?: string | null;
  alert_type?: string | null;
  record_type?: string | null;
  related_record_id?: string | null;
  [key: string]: unknown;
};

export function resolveAlertPath(
  alert: AlertLike,
  createPageUrl: (page: string) => string,
): string | null {
  const recordType = alert.record_type || alert.alert_type;
  const page = ALERT_PAGE_MAP[String(recordType || "")];
  if (!page) return null;
  const base = createPageUrl(page);
  if (alert.related_record_id) {
    return `${base}?id=${encodeURIComponent(String(alert.related_record_id))}`;
  }
  return base;
}

export function filterAlerts(
  alerts: AlertLike[],
  opts: { severityFilter: string; typeFilter: string },
): AlertLike[] {
  return (alerts || []).filter((a) => {
    if (a.is_dismissed) return false;
    const matchSeverity = opts.severityFilter === "all" || a.severity === opts.severityFilter;
    const matchType = opts.typeFilter === "all" || a.alert_type === opts.typeFilter;
    return matchSeverity && matchType;
  });
}

export function uniqueAlertTypes(alerts: AlertLike[]): string[] {
  return [...new Set((alerts || []).map((a) => a.alert_type).filter(Boolean))] as string[];
}

export function severityStyle(severity: string | null | undefined): { bg: string; border: string } {
  return SEVERITY_BG[severity || ""] || SEVERITY_BG.Low;
}

export const ALERT_SEVERITY_FILTERS = [
  "all",
  "Critical",
  "High",
  "Medium",
  "Low",
] as const;

export const alertFilterBtnActive: Record<string, string | number> = {
  padding: "4px 12px",
  borderRadius: "var(--radius-badge)",
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  cursor: "pointer",
  border: "none",
  background: "var(--accent-muted)",
  color: "var(--accent-light)",
};

export const alertFilterBtnInactive: Record<string, string | number> = {
  padding: "4px 12px",
  borderRadius: "var(--radius-badge)",
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.08em",
  cursor: "pointer",
  border: "none",
  background: "var(--bg-surface-low)",
  color: "var(--text-muted)",
};
