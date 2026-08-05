import { describe, expect, it } from "vitest";
import { resolveTriageBucketMembers } from "../drawingSubmittalHubPageHelpers";

describe("resolveTriageBucketMembers", () => {
  const elements = [
    { id: "1", fab_status: "In Fab", is_deleted: false },
    { id: "2", fab_status: "In Fab", is_deleted: true },
    { id: "3", fab_status: "Complete", is_deleted: false },
    { id: "4", fab_status: null, is_deleted: false },
  ];

  it("returns empty when no bucket open", () => {
    expect(resolveTriageBucketMembers(null, elements)).toEqual([]);
  });

  it("filters fab bucket by fab_status", () => {
    const rows = resolveTriageBucketMembers({ kind: "fab", key: "In Fab" }, elements);
    expect(rows.map((r) => r.id)).toEqual(["1"]);
  });

  it("filters detail bucket via summary ids", () => {
    const rows = resolveTriageBucketMembers(
      { kind: "detail", key: "released" },
      elements,
      { idsByStatus: { released: ["3", "4"] } },
    );
    expect(rows.map((r) => r.id)).toEqual(["3", "4"]);
  });
});

import { topPipelineStatuses, buildCriticalTriageItems } from "../drawingSubmittalHubPageHelpers";

describe("topPipelineStatuses / buildCriticalTriageItems", () => {
  it("ranks pipeline counts", () => {
    expect(topPipelineStatuses({ A: 1, B: 5, C: 3 }, 2)).toEqual([["B", 5], ["C", 3]]);
  });

  it("dedupes critical items by id after urgency sort", () => {
    const urgency = (a: any, b: any) => a.rank - b.rank;
    const triage = {
      overdue: [{ id: "1", rank: 2 }, { id: "2", rank: 1 }],
      needsAction: [{ id: "1", rank: 0 }, { id: "3", rank: 3 }],
      dueSoon: [{ id: "4", rank: 4 }],
    };
    const crit = buildCriticalTriageItems(triage as any, urgency, 3);
    expect(crit.map((c: any) => c.id)).toEqual(["1", "2", "3"]);
  });
});
