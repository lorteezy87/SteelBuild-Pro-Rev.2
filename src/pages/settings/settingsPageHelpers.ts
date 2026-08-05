/** Pure helpers for Settings page shell. */

export type SettingsTab = {
  id: string;
  label: string;
  adminOnly?: boolean;
  [key: string]: unknown;
};

export type SettingsGroup = {
  adminOnly?: boolean;
  tabs: SettingsTab[];
  [key: string]: unknown;
};

export function filterVisibleSettingsGroups(
  groups: SettingsGroup[],
  isAdmin: boolean,
): SettingsGroup[] {
  return (groups || [])
    .filter((group) => !group.adminOnly || isAdmin)
    .map((group) => ({
      ...group,
      tabs: (group.tabs || []).filter((tab) => !tab.adminOnly || isAdmin),
    }))
    .filter((group) => group.tabs.length > 0);
}

export function countVisibleSettingsTabs(groups: SettingsGroup[]): number {
  return (groups || []).reduce((count, group) => count + (group.tabs?.length || 0), 0);
}

export function mergeUserPrefs<T extends Record<string, unknown>>(
  prev: T,
  next: Partial<T>,
): T {
  return { ...(prev || ({} as T)), ...(next || {}) };
}
