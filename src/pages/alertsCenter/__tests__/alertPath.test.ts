import { describe, expect, it } from "vitest";
import { resolveAlertPath } from "../alertPath";

describe("resolveAlertPath", () => {
  it("opens server RFI alerts (lowercase record_type) on the RFI", () => {
    expect(resolveAlertPath({ alert_type: "RFI_SLA_Escalation", record_type: "rfi", record_id: "r1", project_id: "p1" }))
      .toBe("/RFIs?id=r1&projectId=p1");
    expect(resolveAlertPath({ alert_type: "RFI_BIC_Handoff", entity_type: "rfi", entity_id: "r2" })).toBe("/RFIs?id=r2");
  });

  it("opens client RFI_Overdue alerts via related_record_id", () => {
    expect(resolveAlertPath({ alert_type: "RFI_Overdue", related_record_id: "r3", project_id: "p1" })).toBe("/RFIs?id=r3&projectId=p1");
  });

  it("opens submittal and delivery engine alerts", () => {
    expect(resolveAlertPath({ alert_type: "Submittal_Stalled", entity_type: "submittal", related_record_id: "s1", project_id: "p1" }))
      .toBe("/Submittals?recordId=s1&projectId=p1");
    expect(resolveAlertPath({ alert_type: "Delivery_Overdue", related_record_id: "d1", project_id: "p1" })).toBe("/Deliveries?projectId=p1");
  });

  it("uses each page's own record parameter and never a legacy route", () => {
    expect(resolveAlertPath({ record_type: "ChangeOrder", record_id: "c1" })).toBe("/ChangeOrders?recordId=c1");
    expect(resolveAlertPath({ record_type: "Drawing", record_id: "x" })).toBe("/DrawingViewer?recordId=x");
  });

  it("gives no Open link for an alert it cannot place", () => {
    expect(resolveAlertPath({ alert_type: "Budget_Variance" })).toBeNull();
  });
});
