import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCommandBrief, commandBriefReason } from "../commandCenterBrief";
import { buildCommandCenterSummary } from "../commandCenterControlCenter.derive";
import type { CommandCenterSources } from "../commandCenterControlCenter.derive";
import { deriveCommandHorizons } from "../commandCenterHorizons";

const sources = (overrides: Partial<CommandCenterSources> = {}): CommandCenterSources => ({
  rfis: [], submittals: [], changeOrders: [], deliveries: [], workPackages: [], scheduleTasks: [], projects: [], ...overrides,
});
const briefFor = (input: CommandCenterSources) => {
  const { actionItems } = buildCommandCenterSummary(input);
  return buildCommandBrief(actionItems, deriveCommandHorizons(actionItems));
};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T23:30:00")); });
afterEach(() => vi.useRealTimers());

describe("execution brief evidence", () => {
  it("uses canonical calendar horizons and preserves source records for drilldown", () => {
    const input = sources({
      workPackages: [{ id: "hold", status: "On Hold", name: "Sequence 2" }],
      scheduleTasks: [
        { id: "two", task_name: "Erect sequence 1", status: "In Progress", end_date: "2026-10-08", assigned_to: "Foreman" },
        { id: "ten", task_name: "Erect sequence 3", status: "In Progress", end_date: "2026-10-16" },
        { id: "eleven", task_name: "Later erection", status: "In Progress", end_date: "2026-10-17", assigned_to: "Foreman" },
      ],
    });
    const brief = briefFor(input);
    expect(brief.priorities.map(({ item, window }) => [item.id, window])).toEqual([
      ["hold", "NOW"], ["two", "48 HOURS"], ["ten", "10 DAYS"],
    ]);
    expect(brief.priorities[0].item.raw).toBe(input.workPackages[0]);
    expect(brief.priorities[0].reason).toBe("Work package recorded as On Hold");
    expect(brief.priorities[1].reason).toBe("Required in 2 calendar days");
  });

  it("surfaces owner/date gaps without treating the RFI default owner as recorded", () => {
    const brief = briefFor(sources({
      rfis: [{ id: "undated", title: "Connection answer", status: "Open" }, { id: "closed", status: "Closed" }],
      submittals: [{ id: "invalid-date", status: "Submitted", required_date: "invalid", ball_in_court: "EOR" }],
      scheduleTasks: [{ id: "task", status: "In Progress", end_date: "2026-10-09", assigned_to: "Foreman" }],
    }));
    expect(brief.missingOwner).toBe(1);
    expect(brief.missingDate).toBe(2);
    expect(brief.priorities.find(({ item }) => item.id === "undated")).toMatchObject({
      window: "RECORD GAP", owner: null, reason: "Required date is not recorded",
    });
  });

  it("limits the brief while keeping an undated gap visible among many urgent records", () => {
    const brief = briefFor(sources({ rfis: [
      ...Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, status: "Open", date_required: "2026-10-05", ball_in_court: "EOR" })),
      { id: "unknown", status: "Open" },
    ] }));
    expect(brief.priorities).toHaveLength(5);
    expect(brief.priorities[4].item.id).toBe("unknown");
    expect(new Set(brief.priorities.map(({ item }) => item.id)).size).toBe(5);
  });

  it("does not invent a missed required date or causal schedule slip for aging commercial records", () => {
    const { actionItems } = buildCommandCenterSummary(sources({ changeOrders: [{ id: "co", status: "Submitted", submitted_date: "2026-09-01" }] }));
    expect(commandBriefReason(actionItems[0])).toBe("Change order pending more than 21 days");
    expect(briefFor(sources()).priorities).toEqual([]);
  });
});
