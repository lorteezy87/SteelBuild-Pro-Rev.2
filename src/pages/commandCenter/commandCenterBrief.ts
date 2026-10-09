import { daysUntil } from "@/lib/dateMath";
import type { ActionItem } from "./commandCenterControlCenter.derive";
import type { CommandHorizon } from "./commandCenterHorizons";

function recordedOwner(item: ActionItem): string | null {
  // The register defaults an unassigned RFI to Contractor; that is not evidence
  // of a recorded owner. Only these three record types expose owner/date fields
  // in the canonical action mapper, so gap counts explicitly cover that scope.
  const owner = item.itemType === "RFI" ? item.raw.ball_in_court : item.owner;
  return typeof owner === "string" && owner.trim() ? owner.trim() : null;
}

export function commandBriefReason(item: ActionItem): string {
  if (item.itemType === "CO" && item.urgency === "overdue") return "Change order pending more than 21 days";
  if (item.itemType === "WP") return "Work package recorded as On Hold";
  if (item.itemType === "DEL" && item.status === "Delayed") return "Delivery recorded as Delayed";
  if (item.itemType === "TASK" && (item.status === "On Hold" || item.status === "Delayed")) return `Schedule task recorded as ${item.status}`;
  if (item.itemType === "RFI" && (item.raw.cost_impact || item.raw.schedule_impact)) return "RFI has a recorded cost or schedule impact";
  const dueDays = daysUntil(item.dueDate);
  if (!Number.isFinite(dueDays)) return "Required date is not recorded";
  if (dueDays < 0) return "Past the recorded required date";
  if (dueDays === 0) return "Required today";
  return `Required in ${dueDays} calendar day${dueDays === 1 ? "" : "s"}`;
}

export function buildCommandBrief(actionItems: ActionItem[], horizons: CommandHorizon[]) {
  const gapScope = actionItems.filter((item) => ["RFI", "SUB", "TASK"].includes(item.itemType));
  const missingOwner = gapScope.filter((item) => !recordedOwner(item));
  const missingDate = gapScope.filter((item) => !Number.isFinite(daysUntil(item.dueDate)));
  const priorities = horizons.flatMap((horizon) => horizon.items.map((item) => ({ item, window: horizon.label })));
  // Include an undated record when it otherwise disappears from every horizon.
  const unique = new Set(priorities.map(({ item }) => `${item.itemType}:${item.id}`));
  const gaps = [...missingDate, ...missingOwner].filter((item) => {
    const key = `${item.itemType}:${item.id}`;
    if (unique.has(key)) return false;
    unique.add(key);
    return true;
  }).map((item) => ({ item, window: "RECORD GAP" }));
  return {
    missingOwner: missingOwner.length,
    missingDate: missingDate.length,
    // Keep the brief compact while preserving each full horizon below it.
    priorities: [...priorities.slice(0, gaps.length ? 4 : 5), ...gaps.slice(0, Math.max(1, 5 - priorities.length))].map((priority) => ({
      ...priority,
      reason: commandBriefReason(priority.item),
      owner: recordedOwner(priority.item),
    })),
  };
}
