import { describe, it, expect } from "vitest";
import { registerStatusTone, isClosedPackage } from "../format";
import { buildDrawingRegisterRows } from "../drawingRegister.derive";
import { buildTriage } from "../format";
import { DETAILING_STATE_ORDER, isPackageReleasedForFab } from "@/lib/detailingPackageState";
import type { CurrentRevisionInfo } from "../types";

const emptyRev = new Map<string, CurrentRevisionInfo>();

function rowsFor(parent: any, submittals: any[] = [], sheets: any[] = []) {
  return buildDrawingRegisterRows({
    setPackages: [{ key: "k", setId: "ds1", name: "Set", parent, sheets, submittals } as any],
    healthByKey: new Map(),
    currentRevByDrawingId: emptyRev,
    summariesBySet: new Map(),
    workdayDues: false,
  });
}

/**
 * The register Status chip used to derive its tone from a regex whose first
 * alternative tested for "Released for Fabrication" and "Approved" — SUBMITTAL
 * statuses that `effectiveDetailingState` never returns. Release-looking
 * workflow labels are neutral because they do not prove server clearance.
 */
describe("registerStatusTone", () => {
  it("keeps workflow release markers and Not Started neutral", () => {
    const neutral = (DETAILING_STATE_ORDER as string[]).filter((s) => registerStatusTone(s) === "neutral");
    expect(neutral).toEqual(expect.arrayContaining(["Not Started", "Released", "Partially Released", "Released for Erection"]));
  });

  it("does not give release-looking workflow states a fabrication-clear tone", () => {
    expect(registerStatusTone("Released")).toBe("neutral");
    expect(registerStatusTone("Partially Released")).toBe("neutral");
    expect(registerStatusTone("Released for Erection")).toBe("neutral");
  });

  it("does not key off submittal statuses, which are not states", () => {
    expect(DETAILING_STATE_ORDER).not.toContain("Released for Fabrication");
    expect(DETAILING_STATE_ORDER).not.toContain("Approved");
  });

  it("tolerates null and unknown states", () => {
    expect(registerStatusTone(null)).toBe("neutral");
    expect(registerStatusTone("Something New")).toBe("neutral");
  });
});

/**
 * The workflow marker stays distinct from the server fabrication gate.
 * `isClosedPackage` is terminal for triage and can fire on dead ends.
 */
describe("Drawing Register: released claim vs terminal-for-triage", () => {
  it("a governing released submittal is both released and terminal", () => {
    const parent: any = { id: "ds1", detailing_state: null, set_approval_status: "approved" };
    const submittals = [{ id: "s", submittal_type: "Shop Drawing", drawing_set_ids: ["ds1"], status: "Released for Fabrication", round_number: 1, approved_date: "2026-09-01" }];
    const [row] = rowsFor(parent, submittals);
    expect(isPackageReleasedForFab(parent, submittals, [])).toBe(true);
    expect(row.done).toBe(true);
    expect(registerStatusTone(row.effectiveState)).toBe("neutral");
  });

  it("a Void-only set is NOT shown as released, though it is terminal", () => {
    const parent: any = { id: "ds1", detailing_state: null };
    const submittals = [{ id: "s", submittal_type: "Shop Drawing", drawing_set_ids: ["ds1"], status: "Void", round_number: 1 }];
    const [row] = rowsFor(parent, submittals);
    expect(isClosedPackage({ key: "k", setId: "ds1", parent, sheets: [], submittals } as any)).toBe(true);
    expect(row.done).toBe(false); // the shop never received it
  });

  it("the deprecated set_approval_status flag alone is NOT a release", () => {
    const parent: any = { id: "ds1", detailing_state: null, set_approval_status: "approved" };
    const [row] = rowsFor(parent, []);
    expect(isClosedPackage({ key: "k", setId: "ds1", parent, sheets: [], submittals: [] } as any)).toBe(true);
    expect(row.done).toBe(false);
  });

  it("late is still suppressed by terminal, so a dead-end set is not chased", () => {
    // Overdue by its sheet dates, but terminal for triage → not late.
    const parent: any = { id: "ds1", detailing_state: null, set_approval_status: "approved", due_date: "2020-01-01" };
    const [row] = rowsFor(parent, []);
    expect(row.done).toBe(false);
    expect(row.late).toBe(false);
  });
});

/**
 * `atRiskCount` was the only triage tally that did not filter closed items.
 * A released package is harmless there — its state outranks every milestone,
 * so computeScheduleRisk returns atRisk: false. A Void-only set is the problem:
 * it derives to "Not Started", the bottom of the state order, so with any past
 * backward date it reports CRITICAL schedule risk forever, on a package nobody
 * will work again.
 */
describe("triage atRiskCount excludes closed packages", () => {
  function triageFor(parent: any, submittals: any[]) {
    const pkg: any = { key: "k", setId: "ds1", name: "Set", parent, sheets: [], submittals };
    const readiness = new Map<string, any>([
      ["k", { scheduleRisk: { atRisk: true, severity: "critical", missed: ["submitBy", "approvalBy"], reasons: ["late"] } }],
    ]);
    return buildTriage(submittals, [pkg], readiness, false);
  }

  it("does not count a Void-only set as at risk", () => {
    const t = triageFor({ id: "ds1", detailing_state: null }, [{ id: "s", submittal_type: "Shop Drawing", drawing_set_ids: ["ds1"], status: "Void", round_number: 1 }]);
    expect(t.atRiskCount).toBe(0);
  });

  it("still counts an OPEN set that is genuinely at risk", () => {
    const t = triageFor(
      { id: "ds1", detailing_state: null },
      [{ id: "s", status: "Submitted", round_number: 1, ball_in_court: "EOR" }],
    );
    expect(t.atRiskCount).toBe(1);
  });
});
