import { describe, expect, it } from "vitest";
import { buildRevisionCompareCandidates } from "../revisionCompareHelpers";

describe("buildRevisionCompareCandidates", () => {
  it("includes current and non-current history rows", () => {
    const list = buildRevisionCompareCandidates(
      { file_url: "a.pdf", revision_number: 3, pdf_page: 2 },
      [
        { id: "r1", file_url: "old.pdf", is_current: false, revision_code: "A", issued_at: "2026-01-01" },
        { id: "r2", file_url: "cur.pdf", is_current: true, revision_code: "B" },
        { id: "r3", file_url: null, is_current: false, revision_code: "C" },
      ],
    );
    expect(list.map((c) => c.key)).toEqual(["current", "r1"]);
    expect(list[0].label).toContain("Rev 3");
    expect(list[1].label).toContain("Rev A");
  });
  it("empty without drawing", () => {
    expect(buildRevisionCompareCandidates(null, [])).toEqual([]);
  });
});
