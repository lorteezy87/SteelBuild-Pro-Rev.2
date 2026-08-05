import { describe, expect, it } from "vitest";
import {
  sortDocuments,
  countReviewDocuments,
  groupDocumentsByCategory,
} from "../utils";

describe("documents sort/filter helpers", () => {
  const docs = [
    { id: "1", displayName: "B", status: "Approved", uploadedDate: "2026-01-02", category: "Shop", fileSizeKb: 10 },
    { id: "2", displayName: "A", status: "Under Review", uploadedDate: "2026-01-03", category: "Shop", fileSizeKb: 20 },
    { id: "3", displayName: "C", status: "Revise & Resubmit", uploadedDate: "2026-01-01", category: "IFC", fileSizeKb: 5 },
  ];

  it("sorts by name and date", () => {
    expect(sortDocuments(docs, "name-asc").map((d) => d.displayName)).toEqual(["A", "B", "C"]);
    expect(sortDocuments(docs, "date-desc").map((d) => d.id)).toEqual(["2", "1", "3"]);
  });

  it("counts review statuses", () => {
    expect(countReviewDocuments(docs)).toBe(2);
  });

  it("groups by category", () => {
    const groups = groupDocumentsByCategory(docs);
    expect(groups.map((g) => g.name)).toEqual(["IFC", "Shop"]);
    expect(groups.find((g) => g.name === "Shop").docs).toHaveLength(2);
  });
});
