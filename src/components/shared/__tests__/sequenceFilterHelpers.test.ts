import { describe, expect, it } from "vitest";
import { buildSequenceFilterTags } from "../sequenceFilterHelpers";

describe("buildSequenceFilterTags", () => {
  it("collects areas and sequences with natural sort", () => {
    const tags = buildSequenceFilterTags([
      { area: "B", sequence_number: 10 },
      { area: "A", sequence_number: 2 },
      { project_area: "A", area_sequence: "C" },
    ]);
    expect(tags.filter((t) => t.type === "area").map((t) => t.value)).toEqual(["A", "B", "C"]);
    expect(tags.filter((t) => t.type === "seq").map((t) => t.value)).toEqual(["2", "10"]);
  });
});
