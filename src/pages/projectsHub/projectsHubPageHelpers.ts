/** Pure helpers for ProjectsHub shell. */

export const PROJECTS_HUB_TAB_DEFS = [
  { key: "projects", label: "Projects" },
  { key: "scope", label: "Scope & Exclusions" },
  { key: "contacts", label: "Contacts" },
  { key: "members", label: "Members" },
] as const;

export type ProjectsHubTabKey = (typeof PROJECTS_HUB_TAB_DEFS)[number]["key"];
