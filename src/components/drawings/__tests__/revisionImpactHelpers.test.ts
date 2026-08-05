import { describe, expect, it } from "vitest";
import {
  filterRevisionsForSheets,
  SEV_ORDER,
  IMPACT_MONO,
} from "../revisionImpactHelpers";

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

describe("SEV_ORDER / IMPACT_MONO", () => {
  it("severity order and mono font", () => {
    expect(SEV_ORDER[0]).toBe("critical");
    expect(IMPACT_MONO).toContain("mono");
  });
});
