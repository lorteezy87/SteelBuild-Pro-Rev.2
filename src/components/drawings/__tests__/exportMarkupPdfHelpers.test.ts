import { describe, expect, it } from "vitest";
import { selectExportSheets } from "../exportMarkupPdfHelpers";

describe("selectExportSheets", () => {
  const drawings = [
    { id: "1", drawing_set_name: "Set A" },
    { id: "2", drawing_set_name: "Set A" },
    { id: "3", drawing_set_name: "Set B" },
  ];
  it("returns single drawing for drawing scope", () => {
    expect(selectExportSheets("drawing", drawings[0], drawings)).toHaveLength(1);
  });
  it("returns set mates for set scope", () => {
    expect(selectExportSheets("set", drawings[0], drawings).map((d) => d.id)).toEqual(["1", "2"]);
  });
  it("empty without active", () => {
    expect(selectExportSheets("set", null, drawings)).toEqual([]);
  });
});
