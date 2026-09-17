import type { ActionItem } from "./commandCenterControlCenter.derive";

export type CommandHorizonKey = "now" | "48h" | "10d";

export interface CommandHorizon {
  key: CommandHorizonKey;
  label: "NOW" | "48 HOURS" | "10 DAYS";
  items: ActionItem[];
}

function localMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysUntil(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const due = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - localMidnight().getTime()) / 86400000);
}

function stableUrgencyOrder(item: ActionItem): number {
  switch (item.urgency) {
    case "overdue": return 0;
    case "blocking": return 1;
    case "due-soon": return 2;
    case "awaiting": return 3;
    default: return 4;
  }
}

function sortItems(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => {
    const urgencyDelta = stableUrgencyOrder(a) - stableUrgencyOrder(b);
    if (urgencyDelta !== 0) return urgencyDelta;
    const aDays = daysUntil(a.dueDate);
    const bDays = daysUntil(b.dueDate);
    if (aDays === null && bDays === null) return a.title.localeCompare(b.title);
    if (aDays === null) return 1;
    if (bDays === null) return -1;
    if (aDays !== bDays) return aDays - bDays;
    return a.title.localeCompare(b.title);
  });
}

export function deriveCommandHorizons(actionItems: ActionItem[]): CommandHorizon[] {
  const now: ActionItem[] = [];
  const fortyEightHours: ActionItem[] = [];
  const tenDays: ActionItem[] = [];

  for (const item of actionItems) {
    const dueDays = daysUntil(item.dueDate);

    if (item.urgency === "overdue" || item.urgency === "blocking" || dueDays === 0 || (dueDays !== null && dueDays < 0)) {
      now.push(item);
      continue;
    }

    if (dueDays !== null && dueDays >= 1 && dueDays <= 2) {
      fortyEightHours.push(item);
      continue;
    }

    if (dueDays !== null && dueDays >= 3 && dueDays <= 10) {
      tenDays.push(item);
    }
  }

  return [
    { key: "now", label: "NOW", items: sortItems(now) },
    { key: "48h", label: "48 HOURS", items: sortItems(fortyEightHours) },
    { key: "10d", label: "10 DAYS", items: sortItems(tenDays) },
  ];
}
