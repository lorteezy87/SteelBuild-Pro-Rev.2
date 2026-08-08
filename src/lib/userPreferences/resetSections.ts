import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "./schema";

export const PREFERENCE_RESET_SECTIONS = {
  appearance: [
    "theme", "accent_color", "font_scale", "contrast_mode", "motion_mode",
    "table_density", "date_format", "time_format", "week_start",
    "measurement_units", "currency_format", "number_format",
  ],
  workspace: [
    "workspace_preset", "default_landing", "default_project_id",
    "favorite_project_ids", "pinned_modules", "sidebar_mode",
    "show_recent_pages", "default_view", "show_tooltips",
    "show_project_numbers", "show_keyboard_hints", "auto_open_drawers",
  ],
  dashboard: [
    "auto_refresh_secs", "visible_kpis", "kpi_order", "dashboard_density",
    "show_welcome",
  ],
  notifications: [
    "notify_rfi_updates", "notify_rfi_overdue", "notify_co_changes",
    "notify_co_approved", "notify_delivery_updates", "notify_delivery_late",
    "notify_submittal_overdue", "notify_constraint_added",
    "notify_fab_released", "notify_schedule_changes", "notify_alerts",
    "notify_budget_threshold", "notify_email", "notify_daily_digest",
    "rfi_overdue_threshold", "delivery_late_threshold", "budget_alert_pct",
    "co_stale_days", "quiet_hours_enabled", "quiet_hours_start",
    "quiet_hours_end", "quiet_hours_urgent_override",
  ],
} as const satisfies Record<string, readonly (keyof UserPreferences)[]>;

export type PreferenceResetSection = keyof typeof PREFERENCE_RESET_SECTIONS;

function clonePreferenceValue<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
  const value = DEFAULT_USER_PREFERENCES[key];
  return (Array.isArray(value) ? [...value] : value) as UserPreferences[K];
}

export function buildPreferenceResetPatch(section: PreferenceResetSection): Partial<UserPreferences> {
  return Object.fromEntries(
    PREFERENCE_RESET_SECTIONS[section].map((key) => [key, clonePreferenceValue(key)]),
  ) as Partial<UserPreferences>;
}
