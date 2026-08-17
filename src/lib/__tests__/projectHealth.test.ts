import { describe, expect, it } from "vitest";
import {
  buildOperationalHealthIndex,
  capHealthScore,
  deriveOperationalHealth,
} from "../projectHealth";

const TODAY = "2026-08-16";

describe("deriveOperationalHealth", () => {
  it("prevents On Track when any overdue evidence exists", () => {
    expect(deriveOperationalHealth({
      storedStatus: "On Track",
      overdueRfis: 1,
      criticalOverdueRfis: 0,
      overdueScheduleTasks: 0,
      rfiEvidenceLoaded: true,
      scheduleEvidenceLoaded: true,
    })).toMatchObject({ label: "Watch", partial: false, reasons: ["1 overdue RFI"] });
  });

  it("marks five overdue leaf tasks At Risk", () => {
    expect(deriveOperationalHealth({
      storedStatus: "On Track",
      overdueRfis: 0,
      criticalOverdueRfis: 0,
      overdueScheduleTasks: 5,
      rfiEvidenceLoaded: true,
      scheduleEvidenceLoaded: true,
    }).label).toBe("At Risk");
  });

  it("never improves a stored worse assessment", () => {
    expect(deriveOperationalHealth({
      storedStatus: "At Risk",
      overdueRfis: 0,
      criticalOverdueRfis: 0,
      overdueScheduleTasks: 0,
      rfiEvidenceLoaded: true,
      scheduleEvidenceLoaded: true,
    }).label).toBe("At Risk");
  });

  it("marks missing schedule evidence partial", () => {
    expect(deriveOperationalHealth({
      storedStatus: "On Track",
      overdueRfis: 0,
      criticalOverdueRfis: 0,
      rfiEvidenceLoaded: true,
      scheduleEvidenceLoaded: false,
    }).partial).toBe(true);
  });

  it("keeps an on-hold project distinct from risk severity", () => {
    expect(deriveOperationalHealth({
      storedStatus: "On Track",
      onHold: true,
      overdueRfis: 3,
      criticalOverdueRfis: 0,
      overdueScheduleTasks: 5,
      rfiEvidenceLoaded: true,
      scheduleEvidenceLoaded: true,
    }).label).toBe("On Hold");
  });

  it("caps Good scores to the effective severity band", () => {
    const atRisk = deriveOperationalHealth({
      storedStatus: "On Track",
      overdueRfis: 3,
      criticalOverdueRfis: 0,
      overdueScheduleTasks: 0,
      rfiEvidenceLoaded: true,
      scheduleEvidenceLoaded: true,
    });
    expect(capHealthScore(96, atRisk)).toBe(69);
  });
});

describe("buildOperationalHealthIndex", () => {
  it("does not leave a past-due incomplete project On Track", () => {
    const index = buildOperationalHealthIndex(
      [{
        id: "p1",
        health_status: "On Track",
        target_completion_date: "2026-08-01",
        scope_complete_pct_override: 75,
      }],
      [],
      [],
      TODAY,
      { rfiEvidenceLoaded: true, scheduleEvidenceLoaded: true },
    );
    expect(index.p1).toMatchObject({
      label: "At Risk",
      reasons: ["Target date overdue at 75% complete"],
    });
  });

  it("does not call a completed past-date project at risk", () => {
    const index = buildOperationalHealthIndex(
      [{
        id: "p1",
        health_status: "On Track",
        target_completion_date: "2026-08-01",
        scope_complete_pct_override: 100,
      }],
      [],
      [],
      TODAY,
      { rfiEvidenceLoaded: true, scheduleEvidenceLoaded: true },
    );
    expect(index.p1.label).toBe("On Track");
  });

  it("uses visible project evidence and excludes parent schedule rows", () => {
    const index = buildOperationalHealthIndex(
      [{ id: "p1", health_status: "On Track" }, { id: "p2", health_status: "On Track" }],
      [
        { id: "r1", project_id: "p1", status: "Open", due_date: "2026-08-15" },
        { id: "r2", project_id: "hidden", status: "Open", due_date: "2026-08-01" },
      ],
      [
        { id: "parent", project_id: "p2", end_date: "2026-08-01" },
        { id: "child", project_id: "p2", parent_task_id: "parent", end_date: "2026-08-01" },
      ],
      TODAY,
      { rfiEvidenceLoaded: true, scheduleEvidenceLoaded: true },
    );

    expect(index.p1).toMatchObject({ label: "Watch", reasons: ["1 overdue RFI"] });
    expect(index.p2).toMatchObject({ label: "Watch", reasons: ["1 overdue schedule task"] });
  });

  it("treats unknown stored status as partial while preserving proven risk", () => {
    const index = buildOperationalHealthIndex(
      [{ id: "p1" }],
      Array.from({ length: 3 }, (_, index) => ({
        id: `r${index}`,
        project_id: "p1",
        status: "Under Review",
        date_required: "2026-08-01",
      })),
      [],
      TODAY,
      { rfiEvidenceLoaded: true, scheduleEvidenceLoaded: true },
    );

    expect(index.p1).toMatchObject({ label: "At Risk", partial: true });
  });
});
