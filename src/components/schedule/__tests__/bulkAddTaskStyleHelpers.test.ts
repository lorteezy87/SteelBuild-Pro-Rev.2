import { describe, expect, it } from "vitest";
import {
  CELL,
  INPUT_STYLE,
  SELECT_STYLE,
  GRID_MIN_WIDTH,
  TASK_TYPES,
  BULK_STATUSES,
} from "../bulkAddTaskStyleHelpers";

describe("bulkAddTaskStyleHelpers", () => {
  it("cell and input chrome", () => {
    expect(CELL.display).toBe("flex");
    expect(INPUT_STYLE.height).toBe(34);
    expect(SELECT_STYLE.fontSize).toBe(11);
  });
  it("grid constants and option lists", () => {
    expect(GRID_MIN_WIDTH).toBe(1346);
    expect(TASK_TYPES).toContain("Milestone");
    expect(BULK_STATUSES).toContain("Not Started");
  });
});
