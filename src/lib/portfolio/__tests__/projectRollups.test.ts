import { describe, expect, it } from "vitest";
import { normalizePortfolioProjectRollup } from "../projectRollups";

describe("normalizePortfolioProjectRollup", () => {
  it("coerces numeric strings from PostgREST numeric columns", () => {
    const row = normalizePortfolioProjectRollup({
      project_id: "p1",
      wp_tons: "12.5",
      approved_co_value: "100000",
      overdue_rfis: "2",
    });
    expect(row).toMatchObject({
      project_id: "p1",
      wp_tons: 12.5,
      approved_co_value: 100_000,
      overdue_rfis: 2,
      open_rfis: 0,
    });
  });

  it("drops rows without a project id", () => {
    expect(normalizePortfolioProjectRollup({})).toBeNull();
    expect(normalizePortfolioProjectRollup(null)).toBeNull();
  });
});
