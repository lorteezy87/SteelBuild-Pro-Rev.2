/**
 * Pure derivations for the Settings Control Center (canonical presentation redesign).
 * No React, no network calls. Only real, deterministic facts derived from
 * the user record + settings data already loaded by the parent page.
 *
 * KPI policy: only surface facts with a real source. No fabricated values
 * (no "active sessions", no "MFA %", no "last login" unless a real column
 * provides it). Omit a KPI entirely rather than show a made-up number.
 */

/** Minimal slice of the auth user the parent passes in. */
export interface SettingsUser {
  role?: string | null;          // global role: "admin" | "user"
  full_name?: string | null;
  email?: string | null;
}

/** Minimal slice of the persisted user prefs (from auth.me()). */
export interface SettingsPrefs {
  theme?: string | null;         // "dark" | "light" | "system" or undefined
  accent_color?: string | null;
  pinned_modules?: string[] | null;
  workspace_preset?: string | null;
  table_density?: string | null;
  favorite_project_ids?: string[] | null;
  default_project_id?: string | null;
}

export type SettingsSyncState = "idle" | "saving" | "saved" | "error";

export interface SettingsSummary {
  /** Display-ready global role label. */
  roleLabel: string;
  /** Whether the user has workspace-admin access. */
  isAdmin: boolean;
  /** Number of settings sections visible to this user. */
  visibleSectionCount: number;
  /**
   * Pinned module count; null if the pref key is absent (→ KPI omitted).
   */
  pinnedModuleCount: number | null;
  /**
   * Current theme label; null if not stored (→ KPI omitted in the UI).
   */
  themeLabel: string | null;
  presetLabel: string | null;
  densityLabel: string | null;
  favoriteProjectCount: number | null;
  defaultProjectLabel: string | null;
  syncLabel: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  user: "Member",
};

/** Format a stored theme value into a human label, or return null if absent. */
export function formatThemeLabel(theme?: string | null): string | null {
  if (!theme) return null;
  const map: Record<string, string> = {
    dark: "Dark",
    light: "Light",
    system: "System",
  };
  return map[theme.toLowerCase()] ?? theme;
}

function formatKnownLabel(value: string | null | undefined, labels: Record<string, string>): string | null {
  if (!value) return null;
  return labels[value.toLowerCase()] ?? value;
}

/**
 * Derive the Settings KPI summary from the user record, prefs, and the
 * number of visible tab sections this user can see.
 */
export function buildSettingsSummary(
  user: SettingsUser | null | undefined,
  prefs: SettingsPrefs | null | undefined,
  visibleSectionCount: number,
  syncState: SettingsSyncState = "idle",
): SettingsSummary {
  const role = user?.role ?? "user";
  const isAdmin = role === "admin";

  const pinnedModules = prefs?.pinned_modules;
  const pinnedModuleCount =
    Array.isArray(pinnedModules) ? pinnedModules.length : null;
  const favoriteProjects = prefs?.favorite_project_ids;

  return {
    roleLabel: ROLE_LABEL[role] ?? "Member",
    isAdmin,
    visibleSectionCount,
    pinnedModuleCount,
    themeLabel: formatThemeLabel(prefs?.theme),
    presetLabel: formatKnownLabel(prefs?.workspace_preset, {
      project_manager: "Project Manager",
      field: "Field",
      fabrication: "Fabrication",
      executive: "Executive",
      custom: "Custom",
    }),
    densityLabel: formatKnownLabel(prefs?.table_density, {
      compact: "Compact",
      normal: "Normal",
      comfortable: "Comfortable",
    }),
    favoriteProjectCount: Array.isArray(favoriteProjects) ? favoriteProjects.length : null,
    defaultProjectLabel: prefs?.default_project_id ? "Selected" : prefs?.default_project_id === null ? "None" : null,
    syncLabel: ({ saving: "Saving…", saved: "Saved", error: "Needs attention" } as const)[syncState as "saving" | "saved" | "error"] ?? null,
  };
}
