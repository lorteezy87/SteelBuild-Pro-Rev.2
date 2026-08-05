import { describe, expect, it } from "vitest";
import { filterRevisionsForSheets } from "../revisionImpactHelpers";

describe("filterRevisionsForSheets", () => {
  it("keeps revisions for sheet ids", () => {
    const revs = filterRevisionsForSheets(
      [
        { id: "1", drawing_id: "a" },
        { id: "2", drawing_id: "b" },
        { id: "3", drawing_id: "c" },
      ],
      [{ id: "a" }, { id: "c" }],
    );
    expect(revs.map((r) => r.id)).toEqual(["1", "3"]);
  });
});
