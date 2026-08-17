import { describe, expect, it } from "vitest";
import { scopeRfiPortfolioRows } from "../rfiPortfolioScope";

describe("scopeRfiPortfolioRows", () => {
  it("keeps only rows owned by visible active projects", () => {
    expect(scopeRfiPortfolioRows(
      [{ id: "p1" }, { id: "p2" }],
      [
        { id: "r1", project_id: "p1" },
        { id: "r2", project_id: "held" },
        { id: "r3", project_id: null },
      ],
    )).toEqual([{ id: "r1", project_id: "p1" }]);
  });
});
