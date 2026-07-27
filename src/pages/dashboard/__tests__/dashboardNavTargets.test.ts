import { describe, expect, it } from "vitest";

/**
 * Dashboard module tile targets must resolve to the canonical pages they label.
 * Wrong targets previously sent Budget Control → BudgetHours and Documents → Submittals.
 */
const DASHBOARD_MODULE_TARGETS = {
  RFIs: "rfis",
  DrawingSubmittalHub: "detailing",
  ScheduleHub: "schedule",
  FieldHub: "field",
  CostHub: "cost-hub",
  ChangeOrders: "change-orders",
  Documents: "documents",
  ReportsHub: "reports",
};

const DASHBOARD_PATHS = {
  rfis: "/RFIs",
  detailing: "/DrawingSubmittalHub",
  schedule: "/Schedule",
  field: "/FieldHub",
  "cost-hub": "/CostHub",
  "change-orders": "/ChangeOrders",
  documents: "/Documents",
  reports: "/ReportsHub",
};

describe("dashboard module navigation map", () => {
  it("maps every labeled module tile to its canonical path", () => {
    for (const [page, target] of Object.entries(DASHBOARD_MODULE_TARGETS) as Array<
      [string, keyof typeof DASHBOARD_PATHS]
    >) {
      expect(DASHBOARD_PATHS[target], `${page} → ${target}`).toBeTruthy();
    }
    expect(DASHBOARD_PATHS["cost-hub"]).toBe("/CostHub");
    expect(DASHBOARD_PATHS.documents).toBe("/Documents");
    expect(DASHBOARD_PATHS.detailing).toBe("/DrawingSubmittalHub");
    expect(DASHBOARD_PATHS.reports).toBe("/ReportsHub");
  });
});
