import { describe, expect, it } from "vitest";
import {
  normalizeSchedulePhase,
  computePhaseCounts,
  selectLinkedSubmittalDocs,
} from "../schedulePageHelpers";
import { PHASES } from "@/utils/phases";

describe("schedulePageHelpers", () => {
  it("normalizes phase from URL", () => {
    expect(normalizeSchedulePhase(null)).toBe("all");
    expect(normalizeSchedulePhase("Nope")).toBe("all");
    expect(normalizeSchedulePhase(PHASES[0])).toBe(PHASES[0]);
  });

  it("counts tasks per phase", () => {
    const tasks = [
      { phase: PHASES[0] },
      { phase: PHASES[0] },
      { phase: PHASES[1] },
      { phase: null },
    ];
    const counts = computePhaseCounts(tasks);
    expect(counts.all).toBe(4);
    expect(counts[PHASES[0]]).toBe(2);
    expect(counts[PHASES[1]]).toBe(1);
  });

  it("selects linked submittal docs", () => {
    const docs = [
      { id: "1", is_submittal: true, linked_wp_id: "w1" },
      { id: "2", is_submittal: true, linked_wp_id: null },
      { id: "3", is_submittal: false, linked_wp_id: "w1" },
    ];
    expect(selectLinkedSubmittalDocs(docs).map((d) => d.id)).toEqual(["1"]);
  });
});
