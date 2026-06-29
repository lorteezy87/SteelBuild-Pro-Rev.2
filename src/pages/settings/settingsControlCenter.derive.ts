/**
 * Pure derivations for the Settings Control Center (command_ui redesign).
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
}

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

/**
 * Derive the Settings KPI summary from the user record, prefs, and the
 * number of visible tab sections this user can see.
 */
export function buildSettingsSummary(
  user: SettingsUser | null | undefined,
  prefs: SettingsPrefs | null | undefined,
  visibleSectionCount: number,
): SettingsSummary {
  const role = user?.role ?? "user";
  const isAdmin = role === "admin";

  const pinnedModules = prefs?.pinned_modules;
  const pinnedModuleCount =
    Array.isArray(pinnedModules) ? pinnedModules.length : null;

  return {
    roleLabel: ROLE_LABEL[role] ?? "Member",
    isAdmin,
    visibleSectionCount,
    pinnedModuleCount,
    themeLabel: formatThemeLabel(prefs?.theme),
  };
}
