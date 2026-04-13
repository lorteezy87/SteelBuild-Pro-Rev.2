/**
 * schemas.js - Zod validation schemas for configuration objects
 *
 * Ensures type safety at runtime for:
 *  - Navigation items, groups, and tabs
 *  - Route registry entries
 *  - Module definitions
 *
 * Used by moduleRegistry.js and routes.js for dev-time validation.
 */

import { z } from "zod";

// ── Nav item schema ──────────────────────────────────────────────────
export const NavItemSchema = z.object({
  label:     z.string().min(1, "Nav item label is required"),
  icon:      z.string().min(1, "Nav item icon is required"),
  page:      z.string().min(1, "Nav item page name is required"),
  badgeKey:  z.string().optional(),
  adminOnly: z.boolean().optional(),
});

// ── Nav group schema ─────────────────────────────────────────────────
export const NavGroupSchema = z.object({
  label: z.string().min(1, "Nav group label is required"),
  items: z.array(NavItemSchema).min(1, "Nav group must have at least one item"),
});

// ── Sidebar group schema ─────────────────────────────────────────────
export const SidebarGroupSchema = z.object({
  label:       z.string().min(1),
  collapsible: z.boolean(),
  items:       z.array(NavItemSchema).min(1),
});

// ── Tab schema ───────────────────────────────────────────────────────
export const TabSchema = z.object({
  label: z.string().min(1, "Tab label is required"),
  pages: z.array(z.string().min(1)).min(1, "Tab must reference at least one page"),
});

// ── Module schema ────────────────────────────────────────────────────
export const ModuleSchema = z.object({
  icon:  z.string().min(1),
  name:  z.string().min(1),
  group: z.string().min(1),
  page:  z.string().min(1),
});

// ── Full config schemas ──────────────────────────────────────────────
export const PrimaryTabsSchema = z.array(TabSchema);
export const NavGroupsSchema   = z.array(NavGroupSchema);
export const SidebarGroupsSchema = z.array(SidebarGroupSchema);
export const ModulesSchema     = z.array(ModuleSchema);

export const TabDefaultPageSchema = z.record(
  z.string(), // tab label
  z.string(), // default page name
);

// ── Validation helper ────────────────────────────────────────────────
/**
 * Validates all navigation configuration and logs detailed errors.
 * Only runs in development. Returns true if all valid.
 */
export function validateNavConfig({ primaryTabs, navGroups, sidebarGroups, allModules, tabDefaultPage }) {
  if (!import.meta.env.DEV) return true;

  const errors = [];

  const check = (schema, data, label) => {
    const result = schema.safeParse(data);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        errors.push(`[${label}] ${issue.path.join(".")}: ${issue.message}`);
      });
    }
  };

  check(PrimaryTabsSchema, primaryTabs, "PRIMARY_TABS");
  check(NavGroupsSchema, navGroups, "NAV_GROUPS");
  check(SidebarGroupsSchema, sidebarGroups, "SIDEBAR_GROUPS");
  check(ModulesSchema, allModules, "ALL_MODULES");
  check(TabDefaultPageSchema, tabDefaultPage, "TAB_DEFAULT_PAGE");

  // Cross-reference: every tab default page should appear in its tab's pages array
  if (primaryTabs && tabDefaultPage) {
    primaryTabs.forEach((tab) => {
      const defaultPage = tabDefaultPage[tab.label];
      if (defaultPage && !tab.pages.includes(defaultPage)) {
        errors.push(
          `[TAB_DEFAULT_PAGE] "${tab.label}" default page "${defaultPage}" is not in tab's pages array: [${tab.pages.join(", ")}]`
        );
      }
    });
  }

  if (errors.length > 0) {
    console.error(`[NavConfig] ${errors.length} validation error(s):`);
    errors.forEach((e) => console.error(`  ${e}`));
    return false;
  }

  return true;
}
