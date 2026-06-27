import { describe, expect, it } from "vitest";
import {
  compareDrawingSetPackages,
  formatDrawingSetNumber,
  sortDrawingSetPackages,
  withDrawingSetNumberMetadata,
} from "../drawingSetOrdering";

describe("drawingSetOrdering", () => {
  it("orders drawing packages by explicit set number before natural set name", () => {
    const sets = [
      { set_name: "Package 10", metadata: { drawing_set_number: "10" } },
      { set_name: "Package 2", metadata: { drawing_set_number: "2" } },
      { set_name: "Package 1", metadata: { drawing_set_number: "1" } },
    ];

    expect(sortDrawingSetPackages(sets).map((set) => set.set_name)).toEqual([
      "Package 1",
      "Package 2",
      "Package 10",
    ]);
  });

  it("keeps ungrouped drawing rows after named packages", () => {
    const sets = [
      { name: "UNGROUPED SHEETS", isUngrouped: true },
      { name: "2 - Framing" },
      { name: "1 - Anchor Bolts" },
    ];

    expect([...sets].sort(compareDrawingSetPackages).map((set) => set.name)).toEqual([
      "1 - Anchor Bolts",
      "2 - Framing",
      "UNGROUPED SHEETS",
    ]);
  });

  it("formats stored metadata numbers and preserves existing metadata", () => {
    const metadata = withDrawingSetNumberMetadata({ source: "upload" }, "P-03");

    expect(metadata).toEqual({ source: "upload", drawing_set_number: "P-03" });
    expect(formatDrawingSetNumber({ metadata })).toBe("P-03");
  });
});
