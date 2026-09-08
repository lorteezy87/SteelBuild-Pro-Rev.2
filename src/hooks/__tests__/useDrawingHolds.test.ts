import { describe, expect, it } from "vitest";
import { activeHoldByDrawingId, sortHoldsNewestFirst } from "@/hooks/useDrawingHolds";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";

function hold(overrides: Partial<DrawingHoldRow>): DrawingHoldRow {
  return {
    id: "h1",
    project_id: "p1",
    drawing_id: "d1",
    reason: "Missing weld symbol on detail 3",
    prior_release_status: "reviewed",
    placed_by_id: "u1",
    placed_by_name: "Nick",
    placed_at: "2026-09-08T10:00:00Z",
    is_active: true,
    released_by_id: null,
    released_by_name: null,
    released_at: null,
    release_notes: null,
    created_at: "2026-09-08T10:00:00Z",
    ...overrides,
  };
}

describe("sortHoldsNewestFirst", () => {
  it("orders by placed_at descending without mutating the input", () => {
    const older = hold({ id: "old", placed_at: "2026-09-01T00:00:00Z" });
    const newer = hold({ id: "new", placed_at: "2026-09-08T00:00:00Z" });
    const input = [older, newer];
    const sorted = sortHoldsNewestFirst(input);
    expect(sorted.map((h) => h.id)).toEqual(["new", "old"]);
    expect(input.map((h) => h.id)).toEqual(["old", "new"]);
  });
});

describe("activeHoldByDrawingId", () => {
  it("maps only active holds, one per drawing", () => {
    const released = hold({ id: "r", drawing_id: "d1", is_active: false });
    const active = hold({ id: "a", drawing_id: "d1", is_active: true });
    const other = hold({ id: "o", drawing_id: "d2", is_active: true });
    const map = activeHoldByDrawingId([released, active, other]);
    expect(map.get("d1")?.id).toBe("a");
    expect(map.get("d2")?.id).toBe("o");
    expect(map.size).toBe(2);
  });

  it("is empty when every hold has been released", () => {
    expect(activeHoldByDrawingId([hold({ is_active: false })]).size).toBe(0);
  });
});
