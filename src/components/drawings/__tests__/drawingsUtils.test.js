import { describe, it, expect } from "vitest";
import { isOverdue, daysLate, groupByDrawingSet } from "../drawingsUtils";

const PAST = "2020-01-01";
const FUTURE = "2999-01-01";

describe("isOverdue", () => {
  it("flags a past-due sheet that is still active", () => {
    expect(isOverdue({ due_date: PAST, stage: "IFC" })).toBe(true);
  });

  it("is not overdue without a due date, or when due in the future", () => {
    expect(isOverdue({ stage: "IFC" })).toBe(false);
    expect(isOverdue({ due_date: FUTURE, stage: "IFC" })).toBe(false);
  });

  it("never flags a done/inactive sheet, even if past due (the 'good sets light up red' fix)", () => {
    expect(isOverdue({ due_date: PAST, stage: "Released" })).toBe(false);
    expect(isOverdue({ due_date: PAST, stage: "IFC", is_superseded: true })).toBe(false);
    expect(isOverdue({ due_date: PAST, stage: "IFC", set_approval_status: "approved" })).toBe(false);
  });
});

describe("daysLate", () => {
  it("is 0 when not overdue and positive when genuinely late", () => {
    expect(daysLate({ due_date: FUTURE, stage: "IFC" })).toBe(0);
    expect(daysLate({ due_date: PAST, stage: "IFC" })).toBeGreaterThan(0);
    expect(daysLate({ due_date: PAST, stage: "Released" })).toBe(0); // done = not late
  });
});

// groupByDrawingSet powers the register table's set-level rollups. Identity is
// the FK drawing_set_id first, legacy drawing_set_name second, UNGROUPED last.
// These lock the grouping keys, the parent-name resolution (F8 fix), the
// set-only seeding from drawing_sets rows, the aggregate rollups, and the
// action-first ordering (needs-attention sets float up, ungrouped stays last).
describe("groupByDrawingSet", () => {
  it("groups sheets by FK drawing_set_id and names the group from the parent set (F8)", () => {
    const drawings = [
      { id: "s1", drawing_set_id: "set-1", sheet_number: "S-101", stage: "IFC" },
      { id: "s2", drawing_set_id: "set-1", sheet_number: "S-102", stage: "Released" },
    ];
    const map = { "set-1": { id: "set-1", set_name: "Main Steel - IFC" } };
    const groups = groupByDrawingSet(drawings, map);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Main Steel - IFC");
    expect(groups[0].setId).toBe("set-1");
    expect(groups[0].isUngrouped).toBe(false);
    expect(groups[0].aggregates.total).toBe(2);
    expect(groups[0].aggregates.releasedCount).toBe(1);
    expect(groups[0].aggregates.percentReleased).toBe(50);
  });

  it("falls back to the legacy drawing_set_name when there is no FK", () => {
    const drawings = [{ id: "s1", drawing_set_name: "Anchor Bolts - OFA", sheet_number: "AB-1", stage: "OFA" }];
    const groups = groupByDrawingSet(drawings, {});
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Anchor Bolts - OFA");
    expect(groups[0].setId).toBeNull();
  });

  it("routes sheets with neither id nor name to one UNGROUPED group, always sorted last", () => {
    const drawings = [
      { id: "s1", drawing_set_id: "set-1", sheet_number: "S-1", stage: "IFA" },
      { id: "u1", sheet_number: "X-1", stage: "IFA" },
      { id: "u2", sheet_number: "X-2", stage: "IFA" },
    ];
    const map = { "set-1": { id: "set-1", set_name: "Structural" } };
    const groups = groupByDrawingSet(drawings, map);
    const ungrouped = groups.find((g) => g.isUngrouped);
    expect(ungrouped).toBeTruthy();
    expect(ungrouped.name).toBe("UNGROUPED SHEETS");
    expect(ungrouped.aggregates.total).toBe(2);
    expect(groups[groups.length - 1].isUngrouped).toBe(true);
  });

  it("seeds set-level-only groups (parent rows with no child sheets) with parent-derived aggregates", () => {
    const map = {
      "set-9": {
        id: "set-9",
        set_name: "BFA Round 2",
        set_approval_status: "pending_review",
        stage_summary: "OFA sent 2026-01",
        file_url: "https://drive/x",
        metadata: { event_count: 3 },
      },
    };
    const groups = groupByDrawingSet([], map);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.setOnly).toBe(true);
    expect(g.aggregates.total).toBe(0);
    expect(g.aggregates.aggregateStatus).toBe("pending_review");
    expect(g.aggregates.stageSummary).toBe("OFA sent 2026-01");
    expect(g.aggregates.driveUrl).toBe("https://drive/x");
    expect(g.aggregates.eventCount).toBe(3);
  });

  it("floats sets needing action (priority / failed extraction) above quiet sets, ungrouped last", () => {
    const drawings = [
      { id: "a1", drawing_set_id: "set-a", sheet_number: "A-1", stage: "IFA" }, // quiet
      { id: "b1", drawing_set_id: "set-b", sheet_number: "B-1", stage: "IFA", priority_flag: true }, // needs action
      { id: "u1", sheet_number: "U-1", stage: "IFA", priority_flag: true }, // ungrouped stays last regardless
    ];
    const map = {
      "set-a": { id: "set-a", set_name: "Alpha" },
      "set-b": { id: "set-b", set_name: "Bravo" },
    };
    const groups = groupByDrawingSet(drawings, map);
    expect(groups[0].name).toBe("Bravo"); // needs-action floats up
    expect(groups[1].name).toBe("Alpha"); // quiet next
    expect(groups[2].isUngrouped).toBe(true); // ungrouped always last
  });

  it("computes the numeric max revision, stripping non-digit revision labels", () => {
    const drawings = [
      { id: "s1", drawing_set_id: "set-1", sheet_number: "S-1", revision_number: "2", stage: "IFA" },
      { id: "s2", drawing_set_id: "set-1", sheet_number: "S-2", revision_number: "Rev 5", stage: "IFA" },
      { id: "s3", drawing_set_id: "set-1", sheet_number: "S-3", revision_number: "IFC", stage: "IFA" },
    ];
    const groups = groupByDrawingSet(drawings, { "set-1": { id: "set-1", set_name: "X" } });
    expect(groups[0].aggregates.maxRev).toBe(5);
  });
});
