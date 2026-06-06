import { describe, expect, it } from "vitest";
import { calculateMarginRisk } from "../marginRiskEngine";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Mirrors the engine's daysBetween(dateStr, new Date()) for age-based scorers
function ageFromDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return Math.round((new Date() - d) / DAY_MS);
}

// Mirrors scorers that zero out hours on "today" (procurement, schedule)
function daysLateFromDate(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  return Math.round((today - d) / DAY_MS);
}

describe("margin risk engine", () => {
  describe("RFI risk", () => {
    it("scores open RFIs with cost and schedule impact", () => {
      const result = calculateMarginRisk({
        rfis: [
          {
            id: "rfi-1",
            rfi_number: "RFI-001",
            title: "Column conflict",
            status: "Open",
            priority: "High",
            submitted_date: daysAgo(10),
            cost_impact_amount: 5000,
            schedule_impact_days: 3,
          },
        ],
      });

      // exposure = $5000 cost + 3 days * $2000/day = $11,000
      expect(result.signals[0].totalExposure).toBe(11000);
      expect(result.signals[0].items).toHaveLength(1);
      expect(result.signals[0].items[0]).toMatchObject({
        signal: "open_rfi",
        severity: "high",
        exposure: 11000,
        entityType: "RFI",
        entityId: "rfi-1",
      });
    });

    it("applies aging penalty for old RFIs without cost impact", () => {
      const dateStr = daysAgo(20);
      const age = ageFromDate(dateStr);
      const result = calculateMarginRisk({
        rfis: [
          {
            id: "rfi-2",
            rfi_number: "RFI-002",
            title: "Embed location TBD",
            status: "Open",
            priority: "Medium",
            submitted_date: dateStr,
          },
        ],
      });

      // ageDays > 14, no cost impact → exposure = age * $500
      expect(result.signals[0].totalExposure).toBe(age * 500);
      expect(result.signals[0].items[0].exposure).toBe(age * 500);
    });

    it("marks critical-priority RFIs as critical severity", () => {
      const result = calculateMarginRisk({
        rfis: [
          {
            id: "rfi-3",
            rfi_number: "RFI-003",
            title: "Foundation redesign",
            status: "Open",
            priority: "Critical",
            submitted_date: daysAgo(5),
            cost_impact_amount: 20000,
          },
        ],
      });

      expect(result.signals[0].items[0].severity).toBe("critical");
    });

    it("promotes old medium-priority RFIs to high severity at 21+ days", () => {
      const result = calculateMarginRisk({
        rfis: [
          {
            id: "rfi-4",
            rfi_number: "RFI-004",
            title: "Stale question",
            status: "Open",
            priority: "Medium",
            submitted_date: daysAgo(25),
          },
        ],
      });

      expect(result.signals[0].items[0].severity).toBe("high");
    });

    it("skips closed, answered, and draft RFIs", () => {
      const result = calculateMarginRisk({
        rfis: [
          { id: "a", status: "Closed", cost_impact_amount: 99999 },
          { id: "b", status: "Answered", cost_impact_amount: 99999 },
          { id: "c", status: "Draft", cost_impact_amount: 99999 },
        ],
      });

      expect(result.signals[0].totalExposure).toBe(0);
      expect(result.signals[0].items).toHaveLength(0);
    });

    it("skips deleted RFIs", () => {
      const result = calculateMarginRisk({
        rfis: [
          {
            id: "rfi-d",
            is_deleted: true,
            status: "Open",
            submitted_date: daysAgo(30),
            cost_impact_amount: 50000,
          },
        ],
      });

      expect(result.signals[0].items).toHaveLength(0);
    });
  });

  describe("submittal risk", () => {
    it("flags rejected submittals with base exposure", () => {
      const result = calculateMarginRisk({
        submittals: [
          {
            id: "sub-1",
            submittal_number: "SUB-010",
            title: "Anchor bolt package",
            status: "Rejected",
            submitted_date: daysAgo(10),
          },
        ],
      });

      // ageDays=10, <=14 → base $4000
      expect(result.signals[1].totalExposure).toBe(4000);
      expect(result.signals[1].items[0]).toMatchObject({
        signal: "rejected_submittal",
        severity: "high",
        exposure: 4000,
      });
    });

    it("adds aging surcharge after 14 days", () => {
      const dateStr = daysAgo(20);
      const age = ageFromDate(dateStr);
      const result = calculateMarginRisk({
        submittals: [
          {
            id: "sub-2",
            submittal_number: "SUB-011",
            status: "Revise and Resubmit",
            submitted_date: dateStr,
          },
        ],
      });

      // exposure = $4000 + age * $300
      expect(result.signals[1].totalExposure).toBe(4000 + age * 300);
    });

    it("marks submittals older than 21 days as critical", () => {
      const result = calculateMarginRisk({
        submittals: [
          {
            id: "sub-3",
            status: "Rejected",
            submitted_date: daysAgo(25),
          },
        ],
      });

      expect(result.signals[1].items[0].severity).toBe("critical");
    });

    it("recognizes 'resubmit' status variants", () => {
      const result = calculateMarginRisk({
        submittals: [
          { id: "a", review_status: "Revise and Resubmit", submitted_date: daysAgo(5) },
          { id: "b", submittal_status: "Resubmit Required", submitted_date: daysAgo(5) },
        ],
      });

      expect(result.signals[1].items).toHaveLength(2);
    });
  });

  describe("labor burn risk", () => {
    it("calculates projected overrun at $85/hr", () => {
      const result = calculateMarginRisk({
        workPackages: [
          {
            id: "wp-1",
            wp_number: "WP-104",
            shop_hours_budget: 200,
            field_hours_budget: 100,
            shop_hours_actual: 180,
            field_hours_actual: 120,
            percent_complete: 50,
          },
        ],
      });

      // actualHours=300, budget=300, projectedTotal = 300 / 0.5 = 600
      // overrun = 600 - 300 = 300h → 300 * $85 = $25,500
      expect(result.signals[2].totalExposure).toBe(25500);
      expect(result.signals[2].items[0].exposure).toBe(25500);
    });

    it("marks burn rate >1.15 as critical", () => {
      const result = calculateMarginRisk({
        workPackages: [
          {
            id: "wp-2",
            shop_hours_budget: 100,
            field_hours_budget: 0,
            shop_hours_actual: 120,
            field_hours_actual: 0,
            percent_complete: 50,
          },
        ],
      });

      // burnRate = 120/100 = 1.2 > 1.15 → critical
      expect(result.signals[2].items[0].severity).toBe("critical");
    });

    it("skips work packages with zero budget", () => {
      const result = calculateMarginRisk({
        workPackages: [
          {
            id: "wp-3",
            shop_hours_budget: 0,
            field_hours_budget: 0,
            shop_hours_actual: 50,
            field_hours_actual: 50,
            percent_complete: 40,
          },
        ],
      });

      expect(result.signals[2].items).toHaveLength(0);
    });

    it("skips work packages at low progress (<= 10%)", () => {
      const result = calculateMarginRisk({
        workPackages: [
          {
            id: "wp-4",
            shop_hours_budget: 100,
            field_hours_budget: 0,
            shop_hours_actual: 20,
            field_hours_actual: 0,
            percent_complete: 10,
          },
        ],
      });

      expect(result.signals[2].items).toHaveLength(0);
    });
  });

  describe("procurement risk", () => {
    it("calculates late delivery exposure at $3,500/day", () => {
      const dateStr = daysAgo(5);
      const late = daysLateFromDate(dateStr);
      const result = calculateMarginRisk({
        deliveries: [
          {
            id: "del-1",
            delivery_number: "DEL-001",
            status: "In Transit",
            required_date: dateStr,
          },
        ],
      });

      expect(result.signals[3].totalExposure).toBe(late * 3500);
      expect(result.signals[3].items[0].severity).toBe("high");
    });

    it("marks deliveries > 7 days late as critical", () => {
      const result = calculateMarginRisk({
        deliveries: [
          {
            id: "del-2",
            status: "Pending",
            required_date: daysAgo(10),
          },
        ],
      });

      expect(result.signals[3].items[0].severity).toBe("critical");
    });

    it("flags at-risk (delayed/hold) deliveries at flat $2,000", () => {
      const result = calculateMarginRisk({
        deliveries: [
          {
            id: "del-3",
            status: "Delayed",
            required_date: "2026-06-01",
          },
        ],
      });

      expect(result.signals[3].totalExposure).toBe(2000);
      expect(result.signals[3].items[0].severity).toBe("medium");
    });

    it("flags on-hold deliveries at flat $2,000 even when well past required date", () => {
      // An explicitly at-risk (delayed/hold) status is a flat exposure tier and
      // must NOT be re-priced by the per-day acceleration charge (daysLate*$3,500),
      // regardless of how late it is.
      const result = calculateMarginRisk({
        deliveries: [
          {
            id: "del-hold",
            status: "On Hold",
            required_date: daysAgo(30),
          },
        ],
      });

      expect(result.signals[3].totalExposure).toBe(2000);
      expect(result.signals[3].items[0].severity).toBe("medium");
    });

    it("applies per-day acceleration cost only to late deliveries not flagged at-risk", () => {
      const dateStr = daysAgo(3);
      const late = daysLateFromDate(dateStr);
      const result = calculateMarginRisk({
        deliveries: [
          {
            id: "del-late",
            status: "In Transit",
            required_date: dateStr,
          },
        ],
      });

      // Not flagged delay/hold → per-day charge, not the flat $2,000 tier.
      expect(result.signals[3].totalExposure).toBe(late * 3500);
      expect(result.signals[3].items[0].severity).toBe("high");
    });

    it("skips delivered / completed / cancelled deliveries", () => {
      const result = calculateMarginRisk({
        deliveries: [
          { id: "a", status: "Delivered", required_date: daysAgo(10) },
          { id: "b", status: "Received", required_date: daysAgo(10) },
          { id: "c", status: "Cancelled", required_date: daysAgo(10) },
        ],
      });

      expect(result.signals[3].items).toHaveLength(0);
    });
  });

  describe("inspection risk", () => {
    it("scores rejected inspections at $8,000", () => {
      const result = calculateMarginRisk({
        inspections: [
          {
            id: "insp-1",
            inspection_number: "INSP-001",
            inspection_type: "Weld",
            sign_off_status: "Rejected",
            deficiencies_count: 0,
          },
        ],
      });

      expect(result.signals[4].totalExposure).toBe(8000);
      expect(result.signals[4].items[0]).toMatchObject({
        signal: "failed_inspection",
        severity: "high",
        exposure: 8000,
      });
    });

    it("scores deficiencies at $2,000 each", () => {
      const result = calculateMarginRisk({
        inspections: [
          {
            id: "insp-2",
            inspection_number: "INSP-002",
            inspection_type: "Bolt tensioning",
            sign_off_status: "Approved",
            status: "Complete",
            deficiencies_count: 3,
          },
        ],
      });

      // 3 * $2,000 = $6,000
      expect(result.signals[4].totalExposure).toBe(6000);
      expect(result.signals[4].items[0].severity).toBe("medium");
    });

    it("uses failed status as rejection indicator", () => {
      const result = calculateMarginRisk({
        inspections: [
          {
            id: "insp-3",
            sign_off_status: "",
            status: "Failed",
            deficiencies_count: 0,
          },
        ],
      });

      expect(result.signals[4].totalExposure).toBe(8000);
    });
  });

  describe("schedule slip risk", () => {
    it("scores critical-path slips at $5,000/day", () => {
      const dateStr = daysAgo(4);
      const late = daysLateFromDate(dateStr);
      const result = calculateMarginRisk({
        scheduleTasks: [
          {
            id: "task-1",
            task_number: "T-100",
            task_name: "Steel erection",
            status: "In Progress",
            percent_complete: 30,
            end_date: dateStr,
            is_critical_path: true,
          },
        ],
      });

      expect(result.signals[5].totalExposure).toBe(late * 5000);
    });

    it("scores non-critical slips at $1,500/day", () => {
      const dateStr = daysAgo(4);
      const late = daysLateFromDate(dateStr);
      const result = calculateMarginRisk({
        scheduleTasks: [
          {
            id: "task-2",
            task_name: "Touch-up paint",
            status: "In Progress",
            percent_complete: 20,
            end_date: dateStr,
            is_critical_path: false,
          },
        ],
      });

      expect(result.signals[5].totalExposure).toBe(late * 1500);
    });

    it("treats milestones as critical path", () => {
      const dateStr = daysAgo(3);
      const late = daysLateFromDate(dateStr);
      const result = calculateMarginRisk({
        scheduleTasks: [
          {
            id: "task-3",
            task_name: "Roof dry-in milestone",
            status: "Not Started",
            percent_complete: 0,
            end_date: dateStr,
            is_milestone: true,
          },
        ],
      });

      expect(result.signals[5].totalExposure).toBe(late * 5000);
    });

    it("skips completed tasks even if past end date", () => {
      const result = calculateMarginRisk({
        scheduleTasks: [
          {
            id: "task-4",
            status: "Completed",
            percent_complete: 100,
            end_date: daysAgo(10),
          },
        ],
      });

      expect(result.signals[5].items).toHaveLength(0);
    });

    it("assigns severity tiers by days late", () => {
      const result = calculateMarginRisk({
        scheduleTasks: [
          { id: "a", status: "In Progress", percent_complete: 50, end_date: daysAgo(3) },
          { id: "b", status: "In Progress", percent_complete: 50, end_date: daysAgo(10) },
          { id: "c", status: "In Progress", percent_complete: 50, end_date: daysAgo(18) },
        ],
      });

      const items = result.signals[5].items;
      expect(items.find(i => i.entityId === "a").severity).toBe("medium");
      expect(items.find(i => i.entityId === "b").severity).toBe("high");
      expect(items.find(i => i.entityId === "c").severity).toBe("critical");
    });
  });

  describe("change order risk", () => {
    it("uses absolute CO amount as exposure", () => {
      const result = calculateMarginRisk({
        changeOrders: [
          {
            id: "co-1",
            co_number: "CO-005",
            title: "Added steel at mezzanine",
            status: "Pending",
            co_amount: 45000,
            submitted_date: daysAgo(15),
          },
        ],
      });

      expect(result.signals[6].totalExposure).toBe(45000);
    });

    it("excludes deductive (credit) CO amounts from margin-at-risk exposure", () => {
      const result = calculateMarginRisk({
        changeOrders: [
          {
            id: "co-2",
            co_number: "CO-006",
            title: "Scope reduction credit",
            status: "Submitted",
            co_amount: -12000,
            submitted_date: daysAgo(5),
          },
        ],
      });

      // A deductive CO reduces the contract — it is NOT positive margin-at-risk
      // exposure. Previously Math.abs() inflated this -$12k credit to +$12k.
      expect(result.signals[6].totalExposure).toBe(0);
    });

    it("assigns severity by dollar threshold", () => {
      const result = calculateMarginRisk({
        changeOrders: [
          { id: "a", status: "Pending", co_amount: 5000, submitted_date: daysAgo(1) },
          { id: "b", status: "Pending", co_amount: 25000, submitted_date: daysAgo(1) },
          { id: "c", status: "Pending", co_amount: 75000, submitted_date: daysAgo(1) },
        ],
      });

      const items = result.signals[6].items;
      expect(items.find(i => i.entityId === "a").severity).toBe("medium");
      expect(items.find(i => i.entityId === "b").severity).toBe("high");
      expect(items.find(i => i.entityId === "c").severity).toBe("critical");
    });

    it("skips approved and voided COs", () => {
      const result = calculateMarginRisk({
        changeOrders: [
          { id: "a", status: "Approved", co_amount: 99999 },
          { id: "b", status: "Voided", co_amount: 99999 },
          { id: "c", status: "Closed", co_amount: 99999 },
        ],
      });

      expect(result.signals[6].items).toHaveLength(0);
    });
  });

  describe("aggregation", () => {
    it("sums total exposure across all signals", () => {
      const result = calculateMarginRisk({
        rfis: [
          { id: "rfi-1", status: "Open", priority: "High", submitted_date: daysAgo(5), cost_impact_amount: 3000, schedule_impact_days: 1 },
        ],
        inspections: [
          { id: "insp-1", sign_off_status: "Rejected", deficiencies_count: 0 },
        ],
      });

      // RFI: $3000 + 1*$2000 = $5000; Inspection: $8000 → total $13,000
      expect(result.totalExposure).toBe(13000);
      expect(result.allItems).toHaveLength(2);
    });

    it("sorts allItems by exposure descending", () => {
      const result = calculateMarginRisk({
        inspections: [
          { id: "insp-small", sign_off_status: "Rejected", deficiencies_count: 0 },
        ],
        changeOrders: [
          { id: "co-big", status: "Pending", co_amount: 100000, submitted_date: daysAgo(1) },
        ],
      });

      expect(result.allItems[0].entityId).toBe("co-big");
      expect(result.allItems[1].entityId).toBe("insp-small");
    });

    it("groups exposure by area", () => {
      const result = calculateMarginRisk({
        rfis: [
          { id: "rfi-a", status: "Open", submitted_date: daysAgo(20), area_sequence: "East Wing" },
          { id: "rfi-b", status: "Open", submitted_date: daysAgo(20), area_sequence: "East Wing" },
          { id: "rfi-c", status: "Open", submitted_date: daysAgo(20), area_sequence: "West Bay" },
        ],
      });

      const areas = result.byArea.map(a => a.area);
      expect(areas).toContain("East Wing");
      expect(areas).toContain("West Bay");
      const east = result.byArea.find(a => a.area === "East Wing");
      expect(east.items).toHaveLength(2);
    });

    it("groups exposure by work package", () => {
      const result = calculateMarginRisk({
        rfis: [
          { id: "rfi-a", status: "Open", submitted_date: daysAgo(20), work_package_id: "wp-1" },
          { id: "rfi-b", status: "Open", submitted_date: daysAgo(20), work_package_id: "wp-1" },
        ],
      });

      const wp1 = result.byWorkPackage.find(wp => wp.workPackageId === "wp-1");
      expect(wp1.items).toHaveLength(2);
    });

    it("counts severity buckets", () => {
      const result = calculateMarginRisk({
        rfis: [
          { id: "rfi-crit", status: "Open", priority: "Critical", submitted_date: daysAgo(5), cost_impact_amount: 1000 },
        ],
        inspections: [
          { id: "insp-high", sign_off_status: "Rejected" },
        ],
        scheduleTasks: [
          { id: "task-med", status: "In Progress", percent_complete: 50, end_date: daysAgo(3) },
        ],
      });

      expect(result.severity.critical).toBe(1);
      expect(result.severity.high).toBe(1);
      expect(result.severity.medium).toBe(1);
    });

    it("limits topRisks to 10 items", () => {
      const changeOrders = Array.from({ length: 15 }, (_, i) => ({
        id: `co-${i}`,
        status: "Pending",
        co_amount: 1000 * (i + 1),
        submitted_date: daysAgo(1),
      }));

      const result = calculateMarginRisk({ changeOrders });
      expect(result.topRisks).toHaveLength(10);
    });

    it("returns zero exposure for empty sources", () => {
      const result = calculateMarginRisk({});
      expect(result.totalExposure).toBe(0);
      expect(result.allItems).toHaveLength(0);
      expect(result.signals).toHaveLength(7);
    });
  });
});
