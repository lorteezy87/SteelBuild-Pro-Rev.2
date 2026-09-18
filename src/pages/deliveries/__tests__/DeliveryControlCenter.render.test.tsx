// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DeliveryControlCenter from "../DeliveryControlCenter";
import type { DeliveryMetrics, DeliveryRecord, DeliverySignals } from "../types";

function signals(overrides: Partial<DeliverySignals> = {}): DeliverySignals {
  return {
    status: "Scheduled",
    open: true,
    scheduledDate: null,
    requiredDate: null,
    actualDate: null,
    expectedShipDate: null,
    daysUntilScheduled: null,
    daysUntilRequired: null,
    overdue: false,
    dueToday: false,
    dueNext7: false,
    unscheduled: true,
    issueStatus: false,
    longLead: false,
    fabReady: false,
    capacityUsed: null,
    flags: [{ key: "unscheduled", label: "No scheduled date", severity: "medium" }],
    risk: "medium",
    readinessScore: 40,
    ...overrides,
  };
}

function delivery(): DeliveryRecord {
  return {
    id: "d-1",
    delivery_title: "Load 12",
    work_package_id: "wp-12",
    sequence_number: "3",
    pieces: 28,
    weight_tons: 8.6,
    carrier: "ABC Trucking",
    required_date: "2026-09-22",
    scheduled_date: null,
    status: "Scheduled",
    _signals: signals(),
  };
}

function metrics(row: DeliveryRecord): DeliveryMetrics {
  return {
    today: new Date("2026-09-18T00:00:00"),
    enriched: [row],
    totalCount: 1,
    openCount: 1,
    deliveredCount: 0,
    totalOpenTons: 8.6,
    totalOpenPieces: 28,
    statusRollup: [{ status: "Scheduled", count: 1, tons: 8.6 }],
    overdue: [],
    dueToday: [],
    dueNext7: [row],
    unscheduled: [row],
    longLeadOpen: [],
    exceptions: [row],
    readyToReceive: [],
    deliveredLast7: [],
    nextLoads: [row],
    calendarDays: [],
  };
}

describe("DeliveryControlCenter Wave 3 layout", () => {
  it("surfaces load attention and unscheduled evidence", () => {
    const row = delivery();
    render(
      <DeliveryControlCenter
        projectName="BIMC ED"
        projectId="project-1"
        deliveries={[row]}
        filtered={[row]}
        metrics={metrics(row)}
        search=""
        onSearch={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        scheduleFilter="all"
        onScheduleFilterChange={vi.fn()}
        riskFilter="all"
        onRiskFilterChange={vi.fn()}
        view="register"
        onViewChange={vi.fn()}
        onOpenDelivery={vi.fn()}
        onExport={vi.fn()}
        dispatchBoard={<div>Dispatch board</div>}
        scheduleView={<div>Schedule view</div>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Delivery Control" })).toBeInTheDocument();
    expect(screen.getByText("Load Attention")).toBeInTheDocument();
    expect(screen.getByText("Unscheduled Loads")).toBeInTheDocument();
    expect(screen.getAllByText(/Load 12/).length).toBeGreaterThan(0);
  });
});
