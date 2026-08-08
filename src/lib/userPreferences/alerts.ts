import type { UserPreferences } from "./schema";

type AlertLike = {
  alert_type?: string | null;
  severity?: string | null;
  [key: string]: unknown;
};

function minutes(value: string): number {
  const [hours, mins] = value.split(":").map(Number);
  return (hours * 60) + mins;
}

export function isQuietHoursActive(now: Date, prefs: UserPreferences): boolean {
  if (!prefs.quiet_hours_enabled) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutes(prefs.quiet_hours_start);
  const end = minutes(prefs.quiet_hours_end);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function preferenceForAlert(alert: AlertLike): keyof UserPreferences {
  const type = String(alert.alert_type ?? "").toLowerCase();
  if (type.includes("rfi") && type.includes("overdue")) return "notify_rfi_overdue";
  if (type.includes("rfi")) return "notify_rfi_updates";
  if ((type.includes("delivery") || type.includes("shipment")) && (type.includes("late") || type.includes("overdue"))) return "notify_delivery_late";
  if (type.includes("delivery") || type.includes("shipment")) return "notify_delivery_updates";
  if (type.includes("change order") || type.includes("co pending")) return type.includes("approved") ? "notify_co_approved" : "notify_co_changes";
  if (type.includes("submittal")) return "notify_submittal_overdue";
  if (type.includes("constraint")) return "notify_constraint_added";
  if (type.includes("fab") && type.includes("release")) return "notify_fab_released";
  if (type.includes("schedule")) return "notify_schedule_changes";
  if (type.includes("budget")) return "notify_budget_threshold";
  return "notify_alerts";
}

function isUrgent(alert: AlertLike): boolean {
  const severity = String(alert.severity ?? "").toLowerCase();
  const type = String(alert.alert_type ?? "").toLowerCase();
  return ["urgent", "critical", "high"].includes(severity) || /overdue|late|blocked|critical/.test(type);
}

export function isAlertEnabled(alert: AlertLike, prefs: UserPreferences): boolean {
  return prefs[preferenceForAlert(alert)] !== false;
}

export function filterAlertsForUser<T extends AlertLike>(
  alerts: readonly T[],
  prefs: UserPreferences,
  now = new Date(),
): T[] {
  const quiet = isQuietHoursActive(now, prefs);
  return alerts.filter((alert) => {
    if (!isAlertEnabled(alert, prefs)) return false;
    if (!quiet) return true;
    return prefs.quiet_hours_urgent_override && isUrgent(alert);
  });
}
