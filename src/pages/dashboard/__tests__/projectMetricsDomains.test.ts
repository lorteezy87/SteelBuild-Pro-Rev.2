import { describe, expect, it } from "vitest";
import {
  budgetHoursVariance,
  certifiedPeriodDeltas,
  criticalPathTasks,
  daysBetween,
  fabStatusRollup,
  latestApplicationPerLineItem,
  monthlySpendBreakdown,
  procurementStatusRollup,
  projectMilestones,
  recentActivityFeed,
  taskDistributionByType,
} from "../projectMetrics";

describe("projectMetrics typed domain boundaries", () => {
  it("preserves date and missing-value behavior", () => {
    expect(daysBetween("2026-09-01", "2026-09-04")).toBe(3);
    expect(daysBetween("invalid", "2026-09-04")).toBeNull();
    expect(daysBetween(null, "2026-09-04")).toBeNull();

    expect(projectMilestones(
      { start_date: "2026-09-01", target_completion_date: "2026-12-01" },
    )).toEqual([
      {
        id: "synthetic-start",
        title: "Project Start",
        date: "2026-09-01",
        status: null,
        synthetic: true,
      },
      {
        id: "synthetic-target",
        title: "Target Completion",
        date: "2026-12-01",
        status: null,
        synthetic: true,
      },
    ]);
  });

  it("keeps budget-hour and fabrication formulas unchanged", () => {
    expect(budgetHoursVariance(
      [{
        shop_hours_budget: 100,
        field_hours_budget: 50,
        metadata: { linked_work_package_ids: ["wp-1"] },
      }],
      [{ id: "wp-1", shop_hours_actual: 125, field_hours_actual: 25 }],
    )).toEqual({
      shopBudget: 100,
      shopActual: 125,
      shopVariancePct: 25,
      fieldBudget: 50,
      fieldActual: 25,
      fieldVariancePct: -50,
      totalBudget: 150,
      totalActual: 150,
      totalVariancePct: 0,
      hasBudget: true,
    });

    expect(fabStatusRollup([
      { phase: "Detailing", status: "Complete", tonnage: 2 },
      { phase: "Fabrication", percent_complete: 80, tonnage: 3 },
      { phase: "Delivery", tonnage: 5 },
    ])).toMatchObject({
      counts: {
        drawings_approved: 0,
        material_on_hand: 1,
        shop_released: 0,
        in_fabrication: 0,
        fabricated: 0,
        finish_treatment: 1,
        ready_to_ship: 1,
      },
      total: 3,
      totalTons: 10,
      shippedTons: 5,
      activeStage: "ready_to_ship",
    });
  });

  it("preserves procurement and schedule status buckets", () => {
    const procurement = procurementStatusRollup([
      {
        procurement_category: "Steel",
        status: "PO Issued",
        weight_tons: 4,
        is_long_lead: true,
        expected_ship_date: "2026-10-10",
        required_date: "2026-10-01",
      },
      {
        procurement_category: "Steel",
        status: "Cancelled",
        weight_tons: 1,
      },
      { status: "Scheduled", delivery_type: "LOGISTICS" },
    ]);
    expect(procurement.total).toBe(2);
    expect(procurement.totalWeight).toBe(5);
    expect(procurement.longLeadSlipping).toBe(1);
    expect(procurement.cancelled).toBe(1);
    expect(procurement.counts["PO Issued"]).toBe(1);
    expect(procurement.activeStage).toBe("PO Issued");

    expect(taskDistributionByType([
      { task_type: "Fabrication", status: "In Progress" },
      { task_type: "Unknown", status: "Open" },
    ])).toMatchObject({
      Fabrication: { tasks: 1, inProgress: 1 },
      Other: { tasks: 1, inProgress: 1 },
    });
    expect(criticalPathTasks([
      { id: "late", task_name: "Later", start_date: "2026-09-02", metadata: { is_critical: true } },
      { id: "early", task_name: "Earlier", start_date: "2026-09-01", metadata: { is_critical: true } },
      { id: "normal", task_name: "Normal", start_date: "2026-08-01" },
    ])).toEqual([
      { id: "early", title: "Earlier", start: "2026-09-01", end: null, status: null },
      { id: "late", title: "Later", start: "2026-09-02", end: null, status: null },
    ]);
  });

  it("preserves SOV row identity and period-delta formulas", () => {
    const lines = [
      {
        project_id: "p1",
        line_item_number: "1",
        application_number: 1,
        status: "Certified",
        scheduled_value: 1000,
        previous_percent_complete: 10,
        current_percent_complete: 25,
        description: "Structural steel",
      },
      {
        project_id: "p1",
        line_item_number: "1",
        application_number: 2,
        status: "Draft",
        scheduled_value: 1000,
        current_percent_complete: 50,
        description: "Structural steel",
      },
    ];

    expect(latestApplicationPerLineItem(lines)[0].description).toBe("Structural steel");
    expect(certifiedPeriodDeltas(lines)).toEqual([{
      projectId: "p1",
      lineItemNumber: "1",
      applicationNumber: 1,
      periodTo: undefined,
      submittedDate: undefined,
      delta: 150,
    }]);
  });

  it("preserves recent-activity display strings and spend month shape", () => {
    expect(recentActivityFeed([
      {
        id: "a1",
        event_type: "stage_changed",
        from_value: null,
        to_value: "OFS",
        created_at: "2026-09-01T10:00:00Z",
        metadata: { set_name: "Set A", sheet_number: "S1" },
      },
      {
        id: "a2",
        event_type: "stage_changed",
        from_value: null,
        to_value: "OFS",
        created_at: "2026-09-01T09:58:00Z",
        metadata: { set_name: "Set A", sheet_number: "S2" },
      },
    ])).toEqual([{
      id: "a1",
      summary: "Stage — → OFS · Set A · 2 sheets",
      when: "2026-09-01T10:00:00Z",
      kind: "stage_changed",
      count: 2,
    }]);

    const months = monthlySpendBreakdown([]);
    expect(months).toHaveLength(6);
    expect(months.every((month) => month.actual === 0 && month.committed === 0)).toBe(true);
  });
});
