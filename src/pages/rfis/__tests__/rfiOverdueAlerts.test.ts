import { describe, expect, it } from "vitest";
import {
  buildRfiOverdueAlertDescription,
  buildRfiOverdueAlertTitle,
  classifyRfiDueUrgency,
  planRfiOverdueAlerts,
  resolveRfiOverdueAlertSeverity,
  startOfLocalDay,
} from "../rfiOverdueAlerts";

function localDay(isoDate: string): Date {
  return startOfLocalDay(new Date(`${isoDate}T12:00:00`));
}

describe("classifyRfiDueUrgency", () => {
  const today = localDay("2026-07-26");

  it("marks overdue with days late", () => {
    expect(classifyRfiDueUrgency("2026-07-20", today)).toEqual({
      isOverdue: true,
      dueSoon: false,
      daysLate: 6,
    });
  });

  it("marks due within 3 days (inclusive of today)", () => {
    expect(classifyRfiDueUrgency("2026-07-26", today)).toEqual({
      isOverdue: false,
      dueSoon: true,
      daysLate: 0,
    });
    expect(classifyRfiDueUrgency("2026-07-29", today)?.dueSoon).toBe(true);
  });

  it("returns null when more than 3 days out", () => {
    expect(classifyRfiDueUrgency("2026-07-30", today)).toBeNull();
  });
});

describe("resolveRfiOverdueAlertSeverity", () => {
  it("follows Critical / High / Medium ladder", () => {
    expect(resolveRfiOverdueAlertSeverity("Critical", 0)).toBe("Critical");
    expect(resolveRfiOverdueAlertSeverity("Low", 7)).toBe("Critical");
    expect(resolveRfiOverdueAlertSeverity("High", 0)).toBe("High");
    expect(resolveRfiOverdueAlertSeverity("Low", 3)).toBe("High");
    expect(resolveRfiOverdueAlertSeverity("Low", 1)).toBe("Medium");
  });
});

describe("title / description builders", () => {
  it("formats overdue and due-soon titles", () => {
    expect(buildRfiOverdueAlertTitle("RFI #012", true, 4)).toBe("RFI #012 OVERDUE — 4d");
    expect(buildRfiOverdueAlertTitle("RFI #012", false, 0)).toBe("RFI #012 due in ≤3 days");
  });

  it("truncates title and defaults BIC", () => {
    const long = "x".repeat(80);
    expect(buildRfiOverdueAlertDescription({
      rfi_number: "RFI #1",
      title: long,
      priority: "High",
    })).toBe(`RFI #1: "${"x".repeat(60)}" · BIC: Contractor · Priority: High`);
  });
});

describe("planRfiOverdueAlerts", () => {
  const today = localDay("2026-07-26");
  const base = {
    id: "r1",
    status: "Open",
    date_required: "2026-07-20",
    rfi_number: "RFI #001",
    title: "Clarify weld",
    ball_in_court: "EOR",
    priority: "High",
    project_id: "p1",
  };

  it("plans an alert for an overdue open RFI", () => {
    const planned = planRfiOverdueAlerts([base], {
      existingRelatedIds: new Set(),
      existingTitles: new Set(),
      alreadyCreatedIds: new Set(),
      projectMap: { p1: "Tower A" },
      today,
    });
    expect(planned).toHaveLength(1);
    expect(planned[0].rfiId).toBe("r1");
    expect(planned[0].projectId).toBe("p1");
    expect(planned[0].alertFields).toMatchObject({
      alert_type: "RFI_Overdue",
      severity: "High",
      title: "RFI #001 OVERDUE — 6d",
      project_name: "Tower A",
      related_record_id: "r1",
      record_type: "RFI",
    });
  });

  it("skips closed, missing due, already-created, existing id/title, and far-future", () => {
    const planned = planRfiOverdueAlerts(
      [
        { ...base, id: "closed", status: "Closed" },
        { ...base, id: "answered", status: "Answered" },
        { ...base, id: "no-due", date_required: null },
        { ...base, id: "session", date_required: "2026-07-20" },
        { ...base, id: "existing-id", date_required: "2026-07-20" },
        { ...base, id: "existing-title", date_required: "2026-07-20", rfi_number: "RFI #X" },
        { ...base, id: "far", date_required: "2026-08-15" },
      ],
      {
        existingRelatedIds: new Set(["existing-id"]),
        existingTitles: new Set(["RFI #X OVERDUE — 6d"]),
        alreadyCreatedIds: new Set(["session"]),
        projectMap: {},
        today,
      },
    );
    expect(planned).toEqual([]);
  });
});
