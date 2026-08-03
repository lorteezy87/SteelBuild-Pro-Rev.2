export const PLANNER_NAV_GROUPS = [
  { label: "Planner", items: ["Command Center", "My Day", "Calendar", "Task Register", "Waiting On"] },
  { label: "Lookaheads", items: ["48-Hour Gate", "10-Day Lookahead", "Milestones"] },
  { label: "Operations", items: ["Drawing / Submittal Readiness", "Change Order Readiness", "RFI Readiness", "Fabrication Readiness", "Delivery Readiness", "Field Readiness", "Meetings"] },
  { label: "Management", items: ["Projects", "Reports", "Archive", "Settings"] },
] as const;

export type PlannerNavLabel = (typeof PLANNER_NAV_GROUPS)[number]["items"][number];

export const PLANNER_NAV_PATHS: Record<PlannerNavLabel, string> = {
  "Command Center": "/",
  "My Day": "/my-day",
  Calendar: "/calendar",
  "Task Register": "/task-register",
  "Waiting On": "/waiting-on",
  "48-Hour Gate": "/48-hour-gate",
  "10-Day Lookahead": "/10-day-lookahead",
  Milestones: "/milestones",
  "Drawing / Submittal Readiness": "/drawing-submittal-readiness",
  "Change Order Readiness": "/change-order-readiness",
  "RFI Readiness": "/rfi-readiness",
  "Fabrication Readiness": "/fabrication-readiness",
  "Delivery Readiness": "/delivery-readiness",
  "Field Readiness": "/field-readiness",
  Meetings: "/meetings",
  Projects: "/projects",
  Reports: "/reports",
  Archive: "/archive",
  Settings: "/settings",
};

export const PLANNER_NAV_ITEMS: readonly PlannerNavLabel[] = PLANNER_NAV_GROUPS.flatMap(
  (group) => group.items,
);
