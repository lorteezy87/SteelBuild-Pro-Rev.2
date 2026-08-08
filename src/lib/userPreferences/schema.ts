import { normalizeNavigationFavorites } from "./navigationFavorites";

export const PREFERENCES_VERSION = 2 as const;

export const DASHBOARD_KPI_IDS = [
  "open_rfis",
  "pending_cos",
  "contract_value",
  "work_packages",
  "deliveries",
  "overdue_items",
  "open_submittals",
  "expenses",
  "rfis_blocking_fab",
] as const;

export type WorkspacePreset = "project_manager" | "field" | "fabrication" | "executive" | "custom";
export type ThemePreference = "system" | "dark" | "light";
export type DensityPreference = "compact" | "normal" | "comfortable";

export interface UserPreferences {
  preferences_version: typeof PREFERENCES_VERSION;
  workspace_preset: WorkspacePreset;
  theme: ThemePreference;
  accent_color: "gold" | "teal" | "blue" | "amber" | "slate";
  font_scale: "sm" | "md" | "lg";
  contrast_mode: "normal" | "high";
  motion_mode: "auto" | "reduced";
  table_density: DensityPreference;
  date_format: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
  time_format: "12h" | "24h";
  week_start: "sunday" | "monday";
  measurement_units: "imperial" | "metric";
  currency_format: "USD" | "CAD" | "EUR";
  number_format: "1,234.56" | "1 234,56" | "1234.56";
  default_landing: string;
  default_project_id: string | null;
  favorite_project_ids: string[];
  pinned_modules: string[];
  sidebar_mode: "remember" | "expanded" | "rail";
  show_recent_pages: boolean;
  default_view: "list" | "board" | "remember";
  show_tooltips: boolean;
  show_project_numbers: boolean;
  show_keyboard_hints: boolean;
  auto_open_drawers: boolean;
  auto_refresh_secs: number;
  visible_kpis: string[];
  kpi_order: string[];
  dashboard_density: DensityPreference;
  show_welcome: boolean;
  notify_rfi_updates: boolean;
  notify_rfi_overdue: boolean;
  notify_co_changes: boolean;
  notify_co_approved: boolean;
  notify_delivery_updates: boolean;
  notify_delivery_late: boolean;
  notify_submittal_overdue: boolean;
  notify_constraint_added: boolean;
  notify_fab_released: boolean;
  notify_schedule_changes: boolean;
  notify_alerts: boolean;
  notify_budget_threshold: boolean;
  notify_email: boolean;
  notify_daily_digest: boolean;
  rfi_overdue_threshold: number;
  delivery_late_threshold: number;
  budget_alert_pct: number;
  co_stale_days: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_urgent_override: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  preferences_version: PREFERENCES_VERSION,
  workspace_preset: "custom",
  theme: "system",
  accent_color: "gold",
  font_scale: "md",
  contrast_mode: "normal",
  motion_mode: "auto",
  table_density: "normal",
  date_format: "MM/DD/YYYY",
  time_format: "12h",
  week_start: "sunday",
  measurement_units: "imperial",
  currency_format: "USD",
  number_format: "1,234.56",
  default_landing: "Dashboard",
  default_project_id: null,
  favorite_project_ids: [],
  pinned_modules: ["ProjectsHub", "RFIs", "DrawingSubmittalHub"],
  sidebar_mode: "remember",
  show_recent_pages: true,
  default_view: "remember",
  show_tooltips: true,
  show_project_numbers: true,
  show_keyboard_hints: true,
  auto_open_drawers: false,
  auto_refresh_secs: 0,
  visible_kpis: [...DASHBOARD_KPI_IDS],
  kpi_order: [...DASHBOARD_KPI_IDS],
  dashboard_density: "normal",
  show_welcome: true,
  notify_rfi_updates: true,
  notify_rfi_overdue: true,
  notify_co_changes: true,
  notify_co_approved: true,
  notify_delivery_updates: true,
  notify_delivery_late: true,
  notify_submittal_overdue: true,
  notify_constraint_added: true,
  notify_fab_released: true,
  notify_schedule_changes: true,
  notify_alerts: true,
  notify_budget_threshold: true,
  notify_email: false,
  notify_daily_digest: false,
  rfi_overdue_threshold: 7,
  delivery_late_threshold: 1,
  budget_alert_pct: 90,
  co_stale_days: 30,
  quiet_hours_enabled: false,
  quiet_hours_start: "18:00",
  quiet_hours_end: "07:00",
  quiet_hours_urgent_override: true,
};

const enumValue = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;

const stringArray = (value: unknown, allowed?: readonly string[]): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string =>
    typeof item === "string" && item.length > 0 && (!allowed || allowed.includes(item)),
  ))];
};

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const boundedNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const time = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;

export function sanitizeUserPreferences(input: unknown): UserPreferences {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const d = DEFAULT_USER_PREFERENCES;
  const notificationKeys = [
    "notify_rfi_updates", "notify_rfi_overdue", "notify_co_changes", "notify_co_approved",
    "notify_delivery_updates", "notify_delivery_late", "notify_submittal_overdue",
    "notify_constraint_added", "notify_fab_released", "notify_schedule_changes",
    "notify_alerts", "notify_budget_threshold", "notify_email", "notify_daily_digest",
  ] as const;

  const notifications = Object.fromEntries(
    notificationKeys.map((key) => [key, bool(source[key], d[key])]),
  ) as Pick<UserPreferences, typeof notificationKeys[number]>;

  return {
    preferences_version: PREFERENCES_VERSION,
    workspace_preset: enumValue(source.workspace_preset, ["project_manager", "field", "fabrication", "executive", "custom"], d.workspace_preset),
    theme: enumValue(source.theme, ["system", "dark", "light"], d.theme),
    accent_color: enumValue(source.accent_color, ["gold", "teal", "blue", "amber", "slate"], d.accent_color),
    font_scale: enumValue(source.font_scale, ["sm", "md", "lg"], d.font_scale),
    contrast_mode: enumValue(source.contrast_mode, ["normal", "high"], d.contrast_mode),
    motion_mode: enumValue(source.motion_mode, ["auto", "reduced"], d.motion_mode),
    table_density: enumValue(source.table_density, ["compact", "normal", "comfortable"], d.table_density),
    date_format: enumValue(source.date_format, ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"], d.date_format),
    time_format: enumValue(source.time_format, ["12h", "24h"], d.time_format),
    week_start: enumValue(source.week_start, ["sunday", "monday"], d.week_start),
    measurement_units: enumValue(source.measurement_units, ["imperial", "metric"], d.measurement_units),
    currency_format: enumValue(source.currency_format, ["USD", "CAD", "EUR"], d.currency_format),
    number_format: enumValue(source.number_format, ["1,234.56", "1 234,56", "1234.56"], d.number_format),
    default_landing: typeof source.default_landing === "string" && source.default_landing ? source.default_landing : d.default_landing,
    default_project_id: typeof source.default_project_id === "string" && source.default_project_id ? source.default_project_id : null,
    favorite_project_ids: stringArray(source.favorite_project_ids),
    pinned_modules: source.pinned_modules === undefined ? [...d.pinned_modules] : normalizeNavigationFavorites(source.pinned_modules),
    sidebar_mode: enumValue(source.sidebar_mode, ["remember", "expanded", "rail"], d.sidebar_mode),
    show_recent_pages: bool(source.show_recent_pages, d.show_recent_pages),
    default_view: enumValue(source.default_view, ["list", "board", "remember"], d.default_view),
    show_tooltips: bool(source.show_tooltips, d.show_tooltips),
    show_project_numbers: bool(source.show_project_numbers, d.show_project_numbers),
    show_keyboard_hints: bool(source.show_keyboard_hints, d.show_keyboard_hints),
    auto_open_drawers: bool(source.auto_open_drawers, d.auto_open_drawers),
    auto_refresh_secs: boundedNumber(source.auto_refresh_secs, d.auto_refresh_secs, 0, 3600),
    visible_kpis: source.visible_kpis === undefined ? [...d.visible_kpis] : stringArray(source.visible_kpis, DASHBOARD_KPI_IDS),
    kpi_order: source.kpi_order === undefined ? [...d.kpi_order] : stringArray(source.kpi_order, DASHBOARD_KPI_IDS),
    dashboard_density: enumValue(source.dashboard_density, ["compact", "normal", "comfortable"], d.dashboard_density),
    show_welcome: bool(source.show_welcome, d.show_welcome),
    ...notifications,
    rfi_overdue_threshold: boundedNumber(source.rfi_overdue_threshold, d.rfi_overdue_threshold, 1, 365),
    delivery_late_threshold: boundedNumber(source.delivery_late_threshold, d.delivery_late_threshold, 1, 365),
    budget_alert_pct: boundedNumber(source.budget_alert_pct, d.budget_alert_pct, 1, 100),
    co_stale_days: boundedNumber(source.co_stale_days, d.co_stale_days, 1, 365),
    quiet_hours_enabled: bool(source.quiet_hours_enabled, d.quiet_hours_enabled),
    quiet_hours_start: time(source.quiet_hours_start, d.quiet_hours_start),
    quiet_hours_end: time(source.quiet_hours_end, d.quiet_hours_end),
    quiet_hours_urgent_override: bool(source.quiet_hours_urgent_override, d.quiet_hours_urgent_override),
  };
}

export const USER_PREFERENCE_KEYS = Object.freeze(
  Object.keys(DEFAULT_USER_PREFERENCES) as Array<keyof UserPreferences>,
);
