import { describe, expect, it } from "vitest";
import { buildDashboardReferenceModel } from "../dashboardReference.derive";

const summary = {
  projectName: "BIMC ED",
  healthScore: 82,
  healthLabel: "Watch",
  operationalHealth: { status: "watch", partial: false, reasons: [] },
  healthReasons: [],
  kpis: [
    { label: "Open RFIs", value: 2, tone: "warn" },
    { label: "Schedule Progress", value: "55%", tone: "neutral" },
    { label: "Cost Health", value: "TBD", tone: "neutral" },
    { label: "Pending Submittals", value: 1, tone: "neutral" },
  ],
  alerts: [],
  summaryRows: [],
  recentActivity: [],
  modules: [],
  openRfis: 2,
  overdueRfis: 1,
  schedulePct: 55,
} as any;

describe("buildDashboardReferenceModel", () => {
  it("turns loaded project evidence into a management attention queue", () => {
    const model = buildDashboardReferenceModel({
      summary,
      todayIso: "2026-09-16",
      rfis: [{ id: "r1", rfi_number: "RFI 018", title: "Brace connection", status: "Open", date_required: "2026-09-15", ball_in_court: "WT", schedule_impact: true }],
      submittals: [],
      workPackages: [],
      deliveries: [],
      changeOrders: [],
    });

    expect(model.attention[0]).toMatchObject({
      id: "rfi:r1",
      issue: "RFI 018 — Brace connection",
      owner: "WT",
      risk: "Schedule",
      tone: "danger",
    });
    expect(model.attention[0].deadline).toBe("Sep 15");
  });

  it("always returns the four approved operational bands", () => {
    const model = buildDashboardReferenceModel({
      summary,
      todayIso: "2026-09-16",
      rfis: [],
      submittals: [],
      workPackages: [],
      deliveries: [],
      changeOrders: [],
    });

    expect(model.bands.map((band) => band.label)).toEqual([
      "Approvals & Engineering",
      "Fabrication & Logistics",
      "Field Readiness",
      "Commercial Exposure",
    ]);
  });

  it("does not invent deadlines when source evidence is absent", () => {
    const model = buildDashboardReferenceModel({
      summary,
      todayIso: "2026-09-16",
      rfis: [{ id: "r2", rfi_number: "RFI 019", status: "Open", schedule_impact: true }],
      submittals: [],
      workPackages: [],
      deliveries: [],
      changeOrders: [],
    });

    const rfi = model.attention.find((item) => item.id === "rfi:r2");
    expect(rfi?.deadline).toBeNull();
  });
});
