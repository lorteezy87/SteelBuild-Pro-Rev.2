import { describe, expect, it } from "vitest";
import {
  computeSubmittalRiskAging,
  RISK_AGING_STAGES,
} from "../submittalRiskAging";

describe("computeSubmittalRiskAging", () => {
  it("only scores R&R / OFS / BFA stages", () => {
    expect(RISK_AGING_STAGES.has("R&R")).toBe(true);
    expect(RISK_AGING_STAGES.has("OFS")).toBe(true);
    expect(RISK_AGING_STAGES.has("BFA")).toBe(true);
    expect(
      computeSubmittalRiskAging({
        stage: "IFC",
        dueDate: "2026-07-20",
        today: "2026-07-25",
      }),
    ).toBeNull();
    expect(
      computeSubmittalRiskAging({
        stage: "OFA",
        dueDate: "2026-07-20",
        today: "2026-07-25",
      }),
    ).toBeNull();
  });

  it("marks overdue / due-today / threateningFab as critical", () => {
    expect(
      computeSubmittalRiskAging({
        stage: "R&R",
        dueDate: "2026-07-20",
        today: "2026-07-25",
        useWorkdays: true,
      }),
    ).toMatchObject({ tier: "critical", tone: "danger" });

    expect(
      computeSubmittalRiskAging({
        stage: "OFS",
        dueDate: "2026-07-25",
        today: "2026-07-25",
        useWorkdays: true,
      }),
    ).toMatchObject({ tier: "critical", tone: "danger" });

    expect(
      computeSubmittalRiskAging({
        stage: "BFA",
        dueDate: "2026-08-15",
        today: "2026-07-25",
        useWorkdays: true,
        threateningFab: true,
      }),
    ).toMatchObject({ tier: "critical" });
  });

  it("uses working-day windows for urgent / attention / normal", () => {
    // Mon 2026-07-27 is 1 working day after Fri 2026-07-24? 
    // today Fri 2026-07-24, due Mon 2026-07-27 → 1 working day (Mon)
    expect(
      computeSubmittalRiskAging({
        stage: "R&R",
        dueDate: "2026-07-27",
        today: "2026-07-24",
        useWorkdays: true,
      }),
    ).toMatchObject({ tier: "urgent" });

    // today Fri 2026-07-24, due Thu 2026-07-30 → Mon Tue Wed Thu = 4 wd
    expect(
      computeSubmittalRiskAging({
        stage: "OFS",
        dueDate: "2026-07-30",
        today: "2026-07-24",
        useWorkdays: true,
      }),
    ).toMatchObject({ tier: "attention" });

    // far out
    expect(
      computeSubmittalRiskAging({
        stage: "OFS",
        dueDate: "2026-08-20",
        today: "2026-07-24",
        useWorkdays: true,
      }),
    ).toMatchObject({ tier: "normal", tone: "neutral" });
  });

  it("falls back to days-in-status when no due date", () => {
    expect(
      computeSubmittalRiskAging({
        stage: "R&R",
        dueDate: null,
        today: "2026-07-25",
        statusChangedAt: "2026-07-10",
        useWorkdays: true,
      }),
    ).toMatchObject({ tier: "critical" });

    // Tue 2026-07-21 → Sat 2026-07-25 = Wed/Thu/Fri = 3 working days stuck → urgent
    expect(
      computeSubmittalRiskAging({
        stage: "OFS",
        dueDate: null,
        today: "2026-07-25",
        statusChangedAt: "2026-07-21",
        useWorkdays: true,
      }),
    ).toMatchObject({ tier: "urgent" });
  });
});
