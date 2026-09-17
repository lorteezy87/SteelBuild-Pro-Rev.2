// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardControlCenter from "../DashboardControlCenter";

vi.mock("@/components/pieceControl/PieceControlDashboardPanel", () => ({
  PieceControlDashboardPanel: () => <div>Piece Control</div>,
}));

vi.mock("../dashboardControlCenter.derive", () => ({
  buildDashboardSummary: () => ({
    projectName: "BIMC ED Expansion",
    healthScore: 82,
    healthLabel: "Watch",
    operationalHealth: { partial: false },
    healthReasons: [] as string[],
    kpis: [
      { label: "Open RFIs", value: 2, tone: "warn" },
      { label: "Schedule Progress", value: "55%", tone: "neutral" },
      { label: "Cost Health", value: "TBD", tone: "neutral" },
      { label: "Pending Submittals", value: 1, tone: "neutral" },
    ],
    alerts: [] as Array<Record<string, unknown>>,
    summaryRows: [] as Array<Record<string, unknown>>,
    recentActivity: [] as Array<Record<string, unknown>>,
    modules: [{ page: "RFIs", title: "RFIs", metric: "2 open", target: "rfis", photo: "" }],
    openRfis: 2,
    overdueRfis: 1,
    schedulePct: 55,
  }),
}));

vi.mock("../dashboardReference.derive", () => ({
  buildDashboardReferenceModel: () => ({
    attention: [{ id: "r1", issue: "RFI 018 — Brace connection", deadline: "Sep 15", risk: "Schedule", owner: "WT", nextAction: "Obtain response", tone: "danger", target: "RFIs" }],
    bands: [
      { id: "approvals", label: "Approvals & Engineering", metric: "3 open", detail: "2 RFIs · 1 submittal", tone: "warn", target: "DrawingSubmittalHub" },
      { id: "production", label: "Fabrication & Logistics", metric: "4 active WPs", detail: "No active holds", tone: "neutral", target: "WorkPackages" },
      { id: "field", label: "Field Readiness", metric: "Ready view", detail: "No late delivery evidence loaded", tone: "neutral", target: "FieldHub" },
      { id: "commercial", label: "Commercial Exposure", metric: "1 pending CO", detail: "No aging CO decisions flagged", tone: "neutral", target: "CostHub" },
    ],
  }),
}));

vi.mock("@/components/command", async () => {
  const actual = await vi.importActual<typeof import("@/components/command")>("@/components/command");
  return { ...actual, useCommandSkin: (): void => undefined };
});

describe("DashboardControlCenter", () => {
  it("prioritizes project condition and management attention over module tiles", () => {
    render(
      <DashboardControlCenter
        project={{ id: "p1", name: "BIMC ED Expansion" }}
        rfis={[]}
        submittals={[]}
        wps={[]}
        deliveries={[]}
        cos={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Project Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Needs Attention")).toBeInTheDocument();
    expect(screen.getByText("Approvals & Engineering")).toBeInTheDocument();
    expect(screen.getByText("Fabrication & Logistics")).toBeInTheDocument();
    expect(screen.getByText("Piece Control")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Quick access" })).toBeInTheDocument();
    expect(screen.queryByText("SteelBuild Modules")).not.toBeInTheDocument();
  });
});
