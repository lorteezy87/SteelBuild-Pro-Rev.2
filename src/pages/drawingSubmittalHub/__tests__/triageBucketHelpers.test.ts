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
