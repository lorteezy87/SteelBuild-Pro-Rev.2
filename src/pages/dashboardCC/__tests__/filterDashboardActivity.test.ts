import { describe, expect, it } from "vitest";
import { filterDashboardActivity } from "../dashboardControlCenter.derive";

describe("filterDashboardActivity", () => {
  const rows = [
    { code: "RFI-1", type: "RFI", description: "Weld detail", status: "Open", relatedTo: "S-101" },
    { code: "CO-2", type: "CO", description: "Extra steel", status: "Approved", relatedTo: "WP-3" },
  ];
  it("filters across activity fields", () => {
    expect(filterDashboardActivity(rows, "")).toHaveLength(2);
    expect(filterDashboardActivity(rows, "weld")).toHaveLength(1);
    expect(filterDashboardActivity(rows, "wp-3")).toHaveLength(1);
  });
});
