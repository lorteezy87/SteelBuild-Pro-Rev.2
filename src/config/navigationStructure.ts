import { SIDEBAR_GROUPS } from "@/config/moduleRegistry";

export interface OperationalNavItem {
  label: string;
  page: string;
  badgeKey?: string;
}

export interface OperationalNavGroup {
  label: string;
  utility?: boolean;
  collapsible?: boolean;
  items: OperationalNavItem[];
}

type RegistryNavItem = OperationalNavItem & { icon?: string };
type RegistryNavGroup = OperationalNavGroup & { items: RegistryNavItem[] };

/**
 * Typed projection of the canonical module registry.
 *
 * The sidebar/module registry remains the single source of truth for route
 * reachability and platform gating; this typed view exists for new TS/TSX
 * shell components and tests without maintaining a second navigation tree.
 */
const registryGroups = SIDEBAR_GROUPS as RegistryNavGroup[];

export const OPERATIONAL_NAV_GROUPS: OperationalNavGroup[] = registryGroups.map((group) => ({
  label: group.label,
  collapsible: group.collapsible,
  utility: group.utility,
  items: group.items.map((item) => ({
    label: item.label,
    page: item.page,
    ...(item.badgeKey ? { badgeKey: item.badgeKey } : {}),
  })),
}));

export const PRIMARY_OPERATIONAL_GROUPS = OPERATIONAL_NAV_GROUPS.filter((group) => !group.utility);
export const UTILITY_OPERATIONAL_GROUPS = OPERATIONAL_NAV_GROUPS.filter((group) => group.utility);
