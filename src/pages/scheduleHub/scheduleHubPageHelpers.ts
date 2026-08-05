/** Pure helpers for ScheduleHub shell. */

export const SCHEDULE_HUB_TAB_DEFS = [
  { key: "schedule", label: "Schedule" },
  { key: "lookahead", label: "Look-Ahead" },
  { key: "calendar", label: "Calendar" },
] as const;

export type ScheduleHubTabKey = (typeof SCHEDULE_HUB_TAB_DEFS)[number]["key"];
