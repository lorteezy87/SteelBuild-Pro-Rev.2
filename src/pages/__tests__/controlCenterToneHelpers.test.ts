
import { describe, expect, it } from "vitest";
import { statusToneForDoc } from "../documents/documentsControlCenterHelpers";
import { statusTone as approvalStatusTone } from "../drawingSubmittalHub/approvalMatrixPanelHelpers";
import { fmtDate, phaseTone } from "../projects/projectsControlCenterHelpers";
import { categoryTone } from "../reportsHub/reportsHubControlCenterHelpers";
import { procStatusTone } from "../procurement/procurementControlCenterHelpers";
import { backchargeTone } from "../backcharges/backchargeControlCenterHelpers";
import { buildContextBody } from "../drawingSubmittalHub/escalateModalHelpers";
import { fromEntity, toEntity } from "../../components/resources/resourceFormModalHelpers";
import { buildSheetOptions } from "../../components/drawings/register/transmittalLogPanelHelpers";

describe("status tones", () => {
  it("documents", () => {
    expect(statusToneForDoc("Approved")).toBe("good");
    expect(statusToneForDoc("Under Review")).toBe("warn");
    expect(statusToneForDoc("Rejected")).toBe("danger");
    expect(statusToneForDoc("Draft")).toBe("info");
  });
  it("approval matrix", () => {
    expect(approvalStatusTone("Approved as Noted")).toBe("good");
    expect(approvalStatusTone("Revise and Resubmit")).toBe("review");
    expect(approvalStatusTone("Void")).toBe("neutral");
    expect(approvalStatusTone("Pending")).toBe("warn");
  });
  it("projects phase + date", () => {
    expect(phaseTone("Fabrication")).toBe("warn");
    expect(phaseTone("Erection")).toBe("good");
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("2026-08-05")).toMatch(/Aug/);
  });
  it("reports / procurement / backcharges", () => {
    expect(categoryTone("Risk")).toBe("danger");
    expect(categoryTone("Financial")).toBe("good");
    expect(procStatusTone("Received")).toBe("good");
    expect(procStatusTone("PO Issued")).toBe("warn");
    expect(backchargeTone("disputed")).toBe("danger");
    expect(backchargeTone("collected")).toBe("good");
  });
});

describe("resource form map", () => {
  it("round-trips key fields", () => {
    const form = fromEntity({
      project_id: "p1",
      name: "Alice",
      resource_type: "Person",
      role: "Detailer",
      capacity: 40,
      cost_rate: 85,
      availability: "Available",
      notes: "n",
      parent_resource_id: null,
      metadata: { actual_hours: 10, forecast_hours: 20 },
    });
    expect(form.budget_hours).toBe(40);
    expect(form.actual_hours).toBe(10);
    const entity = toEntity({ ...form, budget_hours: "40", hourly_rate: "85", actual_hours: "10", forecast_hours: "20" }, "p1");
    expect(entity.capacity).toBe(40);
    expect(entity.cost_rate).toBe(85);
    expect(entity.metadata.actual_hours).toBe(10);
  });
});

describe("buildSheetOptions / buildContextBody", () => {
  it("merges register and historical attachments", () => {
    const opts = buildSheetOptions(
      [{ current_revision_id: "r1", drawing_id: "d1", sheet_number: "S2", sheet_title: "A", current_revision: "A" }],
      [
        { drawing_revision_id: "r1", drawing_id: "d1", sheet_number: "S2", sheet_title: "A", revision_code: "A" },
        { drawing_revision_id: "r0", drawing_id: "d1", sheet_number: "S1", sheet_title: "Old", revision_code: "0" },
      ],
    );
    expect(opts).toHaveLength(2);
    expect(opts.find((o) => o.revisionId === "r0")?.historical).toBe(true);
    expect(opts.find((o) => o.revisionId === "r1")?.historical).toBe(false);
  });
  it("builds escalate body", () => {
    const body = buildContextBody(
      { kind: "Set", title: "S-100", status: "IFA", owner: "Bob", dueDate: "2026-08-01", group: "Pkg1" },
      (d) => d,
    );
    expect(body).toContain("Escalated from Detailing Control");
    expect(body).toContain("Required date: 2026-08-01");
    expect(body).toContain("Issue / question:");
  });
});
