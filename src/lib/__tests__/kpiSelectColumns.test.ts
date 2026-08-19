import { describe, expect, it } from "vitest";
import {
  ACTION_ITEM_KPI_COLUMNS,
  CO_KPI_COLUMNS,
  COST_CODE_KPI_COLUMNS,
  DELIVERY_KPI_COLUMNS,
  RFI_KPI_COLUMNS,
  SCHEDULE_KPI_COLUMNS,
  WP_KPI_COLUMNS,
} from "../kpiSelectColumns";

const ALL = [
  WP_KPI_COLUMNS,
  RFI_KPI_COLUMNS,
  CO_KPI_COLUMNS,
  SCHEDULE_KPI_COLUMNS,
  COST_CODE_KPI_COLUMNS,
  DELIVERY_KPI_COLUMNS,
  ACTION_ITEM_KPI_COLUMNS,
];

describe("kpiSelectColumns", () => {
  it("are comma-separated table columns, never a star select", () => {
    for (const columns of ALL) {
      expect(columns.includes("*")).toBe(false);
      expect(columns.includes("project_id")).toBe(true);
      expect(columns.startsWith("id,")).toBe(true);
    }
  });

  it("does not request the nonexistent schedule_tasks.is_deleted column", () => {
    expect(SCHEDULE_KPI_COLUMNS.includes("is_deleted")).toBe(false);
  });
});
