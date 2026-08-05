/** Pure catalogs for NotificationsTab. */

export const NOTIFICATION_PREFS = [
  { key: "notify_rfi_updates", label: "RFI Updates", desc: "Created, updated, answered", category: "Project Activity" },
  { key: "notify_rfi_overdue", label: "RFI Overdue", desc: "When RFI passes due date", category: "Project Activity", urgent: true },
  { key: "notify_co_changes", label: "Change Orders", desc: "Submitted or approved", category: "Project Activity" },
  { key: "notify_co_approved", label: "CO Approved", desc: "When a CO gets approved", category: "Project Activity" },
  { key: "notify_delivery_updates", label: "Deliveries", desc: "Status changes on shipments", category: "Project Activity" },
  { key: "notify_delivery_late", label: "Late Deliveries", desc: "When a delivery is past date", category: "Project Activity", urgent: true },
  { key: "notify_submittal_overdue", label: "Submittal Overdue", desc: "Drawings past due date", category: "Project Activity", urgent: true },
  { key: "notify_constraint_added", label: "New Constraint", desc: "When a constraint is logged", category: "Steel Specific" },
  { key: "notify_fab_released", label: "Fab Release", desc: "When a WP moves to fab", category: "Steel Specific" },
  { key: "notify_schedule_changes", label: "Schedule Changes", desc: "Task dates updated", category: "Project Activity" },
  { key: "notify_alerts", label: "Critical Alerts", desc: "System-generated alerts", category: "System", urgent: true },
  { key: "notify_budget_threshold", label: "Budget Threshold", desc: "When cost code hits 90%", category: "System", urgent: true },
  { key: "notify_email", label: "Email Notifications", desc: "Receive notifications via email", category: "Delivery" },
  { key: "notify_daily_digest", label: "Daily Digest", desc: "Get daily summary of activity", category: "Delivery" },
] as const;

export const NOTIFICATION_THRESHOLDS = [
  { key: "rfi_overdue_threshold", label: "RFI overdue after", unit: "days", default: 7 },
  { key: "delivery_late_threshold", label: "Delivery late after", unit: "days", default: 1 },
  { key: "budget_alert_pct", label: "Budget alert at", unit: "%", default: 90 },
  { key: "co_stale_days", label: "CO stale after", unit: "days", default: 30 },
] as const;

export const QUIET_HOURS_DEFAULTS = {
  quiet_hours_enabled: false,
  quiet_hours_start: "18:00",
  quiet_hours_end: "07:00",
  quiet_hours_urgent_override: true,
} as const;

export const NOTIFICATIONS_LABEL_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  marginBottom: 12,
  display: "block" as const,
};

export const NOTIFICATIONS_INPUT_STYLE = {
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
};
