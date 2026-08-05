import { describe, expect, it } from "vitest";
import { REVENUE_PALETTE } from "../revenueDashboardHelpers";
import { CATEGORY_COLORS } from "../weeklyReportHelpers";
import { TASK_STATUS_COLORS, TASK_STATUS_KEYS } from "../tasksStatusHelpers";
import { TASK_BOARD_COLUMNS, TASK_BOARD_STATUSES } from "../taskBoardHelpers";
import {
  SCHEDULE_STATUS_FILTERS,
  SCHEDULE_TYPE_FILTERS,
} from "../scheduleReportHelpers";
import { PROJECT_STATUS_MATRIX_GRID_COLS } from "../projectStatusMatrixHelpers";
import { SEVERITY_COLORS } from "../urgentCardHelpers";
import {
  ROW_HEIGHT as PPM_ROW_HEIGHT,
  BAR_HEIGHT as PPM_BAR_HEIGHT,
  LEFT_GUTTER as PPM_LEFT_GUTTER,
} from "../ppmRoadmapHelpers";

describe("report pure catalog atoms", () => {
  it("revenue palette has 7 colors", () => {
    expect(REVENUE_PALETTE).toHaveLength(7);
    expect(REVENUE_PALETTE[0]).toContain("status-info");
  });

  it("weekly cost category colors", () => {
    expect(CATEGORY_COLORS.length).toBe(10);
    expect(CATEGORY_COLORS[0]).toBe("var(--accent)");
  });

  it("task status colors cover all keys", () => {
    for (const k of TASK_STATUS_KEYS) {
      expect(TASK_STATUS_COLORS[k]).toBeTruthy();
    }
  });

  it("task board columns align with statuses", () => {
    expect(TASK_BOARD_COLUMNS.map((c) => c.key)).toEqual([...TASK_BOARD_STATUSES]);
  });

  it("schedule filter catalogs start with all", () => {
    expect(SCHEDULE_STATUS_FILTERS[0].key).toBe("all");
    expect(SCHEDULE_TYPE_FILTERS[0].key).toBe("all");
    expect(SCHEDULE_STATUS_FILTERS.length).toBe(6);
    expect(SCHEDULE_TYPE_FILTERS.length).toBe(7);
  });

  it("project status matrix grid cols", () => {
    expect(PROJECT_STATUS_MATRIX_GRID_COLS.split(" ")).toHaveLength(11);
  });

  it("urgent severity colors", () => {
    expect(SEVERITY_COLORS.critical).toContain("error");
    expect(SEVERITY_COLORS.low).toContain("muted");
  });

  it("ppm roadmap layout", () => {
    expect(PPM_ROW_HEIGHT).toBe(32);
    expect(PPM_BAR_HEIGHT).toBe(18);
    expect(PPM_LEFT_GUTTER).toBe(220);
  });
});
