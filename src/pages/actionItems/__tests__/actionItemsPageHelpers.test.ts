import { describe, expect, it } from "vitest";
import {
  splitSetupItems,
  computeSetupStats,
  collectKnownAssignees,
  computeActionItemStats,
  filterActionItems,
  buildExecutionQueue,
  resolveToggleStatus,
} from "../actionItemsPageHelpers";
import { ACTION_ITEM_STATUS, PRIORITY } from "@/lib/enums";

describe("actionItemsPageHelpers", () => {
  const items = [
    { id: "s1", category: "SETUP", status: ACTION_ITEM_STATUS.COMPLETE, metadata: { sort_order: 2 }, title: "Setup A" },
    { id: "s2", category: "SETUP", status: ACTION_ITEM_STATUS.OPEN, metadata: { sort_order: 1 }, title: "Setup B" },
    { id: "a1", category: "GENERAL", status: ACTION_ITEM_STATUS.OPEN, priority: PRIORITY.CRITICAL, assigned_to: "Ada", title: "Fix bolt", due_date: "2020-01-01" },
    { id: "a2", category: "GENERAL", status: ACTION_ITEM_STATUS.COMPLETE, priority: PRIORITY.LOW, assigned_to: "Bob", title: "Done" },
  ];

  it("splits setup vs action and setup stats", () => {
    const { setupItems, actionItems } = splitSetupItems(items as any);
    expect(setupItems.map((i) => i.id)).toEqual(["s2", "s1"]);
    expect(actionItems).toHaveLength(2);
    expect(computeSetupStats(setupItems).complete).toBe(1);
    expect(computeSetupStats(setupItems).pct).toBe(50);
  });

  it("assignees/stats/filter/queue", () => {
    const { actionItems } = splitSetupItems(items as any);
    expect(collectKnownAssignees(actionItems)).toEqual(["Ada", "Bob"]);
    const stats = computeActionItemStats(actionItems);
    expect(stats.open).toBe(1);
    expect(stats.critical).toBe(1);
    expect(filterActionItems(actionItems, { filterStatus: "all", filterPriority: PRIORITY.CRITICAL, search: "" })).toHaveLength(1);
    const queue = buildExecutionQueue(actionItems, () => -3, 5);
    expect(queue[0].id).toBe("a1");
    expect(resolveToggleStatus(ACTION_ITEM_STATUS.COMPLETE)).toBe(ACTION_ITEM_STATUS.OPEN);
    expect(resolveToggleStatus(ACTION_ITEM_STATUS.OPEN)).toBe(ACTION_ITEM_STATUS.COMPLETE);
  });
});
