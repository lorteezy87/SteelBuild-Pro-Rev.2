import { describe, expect, it } from "vitest";
import { buildLiveDocumentCategories } from "../documentsControlCenter.derive";

describe("buildLiveDocumentCategories", () => {
  it("prepends All and sorts unique categories", () => {
    expect(buildLiveDocumentCategories([
      { category: "Specs" },
      { category: null },
      { category: "Specs" },
      { category: "Drawings" },
    ])).toEqual(["All", "Drawings", "Specs", "Uncategorized"]);
  });
});
