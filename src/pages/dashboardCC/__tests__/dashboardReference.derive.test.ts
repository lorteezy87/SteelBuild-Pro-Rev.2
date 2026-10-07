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

describe("attention preview completeness", () => {
  it("counts hidden production and commercial risks behind a full RFI preview", () => {
    const model = buildDashboardReferenceModel({
      summary, todayIso: "2026-09-16",
      rfis: Array.from({ length: 8 }, (_, i) => ({
        id: `r${i}`, rfi_number: `A-${i}`, status: "Open", date_required: "2026-09-15",
      })),
      submittals: [], deliveries: [],
      workPackages: [{ id: "held", wp_number: "ZZ-WP", status: "On Hold" }],
      changeOrders: [{
        id: "aging", co_number: "ZZ-CO", status: "Submitted", submitted_date: "2026-08-23",
      }],
    });
    expect(model.attention).toHaveLength(8);
    expect(model.attention.every((item) => item.target === "RFIs")).toBe(true);
    expect(model.attentionTotal).toBe(10);
    expect(model.attentionCounts).toEqual({ danger: 9, warn: 1, info: 0, neutral: 0, good: 0 });
    expect(model.bands.find((band) => band.id === "production")?.tone).toBe("danger");
    expect(model.bands.find((band) => band.id === "commercial")).toMatchObject({
      tone: "warn", detail: "1 aging decision needs action",
    });
  });
});

it("does not treat canceled or removed loads as recovery work", () => {
  const model = buildDashboardReferenceModel({
    summary, todayIso: "2026-10-06", rfis: [], submittals: [], workPackages: [], changeOrders: [],
    deliveries: [
      { id: "canceled", status: "Cancelled", scheduled_date: "2026-10-01" },
      { id: "removed", status: "Delayed", scheduled_date: "2026-10-01", is_deleted: true },
    ],
  });
  expect(model.attentionTotal).toBe(0);
  expect(model.bands.find(band => band.id === "production")?.tone).toBe("neutral");
  expect(model.bands.find(band => band.id === "field")?.tone).toBe("neutral");
});
