import { describe, expect, it } from "vitest";
import {
  resolveAlertPath,
  filterAlerts,
  uniqueAlertTypes,
  severityStyle,
} from "../alertsCenterPageHelpers";

describe("alertsCenterPageHelpers", () => {
  it("resolves paths", () => {
    expect(resolveAlertPath({ alert_type: "RFI", related_record_id: "x" }, (p) => `/${p}`)).toBe(
      "/RFIs?id=x",
    );
    expect(resolveAlertPath({ record_type: "Drawing" }, (p) => `/${p}`)).toBe("/Drawings");
    expect(resolveAlertPath({ alert_type: "Unknown" }, (p) => `/${p}`)).toBeNull();
  });

  it("filters and types", () => {
    const rows = [
      { severity: "High", alert_type: "RFI", is_dismissed: false },
      { severity: "Low", alert_type: "Delivery", is_dismissed: true },
      { severity: "High", alert_type: "RFI", is_dismissed: false },
      { severity: "Critical", alert_type: "ChangeOrder", is_dismissed: false },
    ];
    expect(filterAlerts(rows, { severityFilter: "High", typeFilter: "all" })).toHaveLength(2);
    expect(filterAlerts(rows, { severityFilter: "all", typeFilter: "ChangeOrder" })).toHaveLength(1);
    expect(uniqueAlertTypes(rows)).toEqual(["RFI", "Delivery", "ChangeOrder"]);
    expect(severityStyle("Critical").border).toBe("var(--status-error)");
  });
});
