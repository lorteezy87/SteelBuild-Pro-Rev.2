import { describe, expect, it } from "vitest";
import { excerptText, buildTopRisksList } from "../topRisksHelpers";

describe("topRisksHelpers", () => {
  it("excerpts text", () => {
    expect(excerptText(null, 10)).toBeNull();
    expect(excerptText("short", 10)).toBe("short");
    expect(excerptText("one two three four five six", 12)).toMatch(/…$/);
  });

  it("filters sorts and limits top risks", () => {
    const list = buildTopRisksList(
      [
        { id: "1", project_id: "p1", status: "Open" },
        { id: "2", project_id: "p2", status: "Open" },
        { id: "3", project_id: "p1", status: "Closed" },
      ],
      {
        projectFilter: "p1",
        activeOnly: "active",
        isActiveRisk: (r) => r.status === "Open",
        scoreOf: (r) => (r.id === "1" ? 9 : 1),
        limit: 10,
      },
    );
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("1");
    expect(list[0].score).toBe(9);
  });
});
