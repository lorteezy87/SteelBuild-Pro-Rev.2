/** Pure helpers for ResourceHub shell. */

export const RESOURCE_HUB_TAB_DEFS = [
  { key: "register", label: "Resource Register" },
  { key: "schedule", label: "Crew Schedule" },
] as const;

export type ResourceHubTabKey = (typeof RESOURCE_HUB_TAB_DEFS)[number]["key"];
