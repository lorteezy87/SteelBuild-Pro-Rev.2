import { describe, expect, it } from "vitest";
import { bucketBoardItemsByStage, summarizeBoardItems } from "../submittalVisualBoardHelpers";

describe("bucketBoardItemsByStage", () => {
  it("buckets known stages and falls back", () => {
    const order = ["Not Started", "Released"] as const;
    const b = bucketBoardItemsByStage(
      [{ stage: "Released" }, { stage: "Weird" }, { stage: "Not Started" }],
      order,
    );
    expect(b.Released).toHaveLength(1);
    expect(b["Not Started"]).toHaveLength(2);
  });
});

describe("summarizeBoardItems", () => {
  it("counts flags", () => {
    const s = summarizeBoardItems([
      { due: { overdue: true, dueSoon: false }, needsAction: true, linked: false, stage: "Released" },
      { due: { overdue: false, dueSoon: true }, needsAction: false, linked: true, stage: "Draft" },
    ]);
    expect(s).toMatchObject({ total: 2, overdue: 1, dueSoon: 1, needsAction: 1, unlinked: 1, released: 1 });
  });
});
