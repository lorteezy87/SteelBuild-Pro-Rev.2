import type { UserPreferences } from "./schema";

type AlertLike = {
  alert_type?: string | null;
  severity?: string | null;
  title?: string | null;
  description?: string | null;
  created_at?: string | null;
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

function numericField(alert: AlertLike, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(alert[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function metricFromText(alert: AlertLike, pattern: RegExp): number | null {
  const text = [alert.alert_type, alert.title, alert.description].filter(Boolean).join(" ");
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) return null;
  const value = Number(matches.at(-1)?.[1]);
  return Number.isFinite(value) ? value : null;
}

function daysSince(value: unknown, now: Date): number | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const created = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(created.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000));
}

function isUrgent(alert: AlertLike, prefs: UserPreferences, now: Date): boolean {
  const severity = String(alert.severity ?? "").toLowerCase();
  const type = [alert.alert_type, alert.title, alert.description].filter(Boolean).join(" ").toLowerCase();
  const severityFallback = ["urgent", "critical", "high"].includes(severity);

  if (type.includes("rfi") && type.includes("overdue")) {
    const days = numericField(alert, ["days_overdue", "overdue_days"])
      ?? metricFromText(alert, /(\d+(?:\.\d+)?)\s*(?:days?|d)\b/gi);
    return days === null ? severityFallback || /overdue/.test(type) : days >= prefs.rfi_overdue_threshold;
  }
  if ((type.includes("delivery") || type.includes("shipment")) && /late|overdue/.test(type)) {
    const days = numericField(alert, ["days_late", "days_overdue", "overdue_days"])
      ?? metricFromText(alert, /(\d+(?:\.\d+)?)\s*(?:days?|d)\b/gi);
    return days === null ? severityFallback || /late|overdue/.test(type) : days >= prefs.delivery_late_threshold;
  }
  if (type.includes("budget")) {
    const percent = numericField(alert, ["budget_percent", "percent_used", "usage_percent"])
      ?? metricFromText(alert, /(\d+(?:\.\d+)?)\s*%/gi);
    return percent === null ? severityFallback : percent >= prefs.budget_alert_pct;
  }
  if ((type.includes("change order") || type.includes("co pending")) && !type.includes("approved")) {
    const age = numericField(alert, ["days_pending", "age_days", "stale_days"])
      ?? daysSince(alert.created_at, now);
    return age === null ? severityFallback : age >= prefs.co_stale_days;
  }
  return severityFallback || /overdue|late|blocked|critical/.test(type);
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
    return prefs.quiet_hours_urgent_override && isUrgent(alert, prefs, now);
  });
}
