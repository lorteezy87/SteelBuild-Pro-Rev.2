import { describe, expect, it } from "vitest";
import { flagFloatProtection } from "../floatProtection";
import type { CpmRow } from "../cpmFloat";

function cpm(totalFloat: number | null): CpmRow {
  return {
    earlyStart: "2026-06-01",
    earlyFinish: "2026-06-10",
    lateStart: "2026-06-01",
    lateFinish: "2026-06-10",
    totalFloat,
    critical: totalFloat !== null && totalFloat <= 0,
  };
}

describe("flagFloatProtection", () => {
  it("flags 12d float as watch", () => {
    const flags = flagFloatProtection(
      [{ id: "a", task_name: "Fab", wbs_code: "4.1" }],
      new Map([["a", cpm(12)]]),
    );
    expect(flags.map((f) => f.code)).toContain("float_watch");
  });

  it("flags 3d float as alert", () => {
    const flags = flagFloatProtection(
      [{ id: "a", task_name: "Fab", wbs_code: "4.1" }],
      new Map([["a", cpm(3)]]),
    );
    expect(flags[0].code).toBe("float_thin");
    expect(flags[0].severity).toBe("alert");
  });

  it("flags 0 float as critical", () => {
    const flags = flagFloatProtection(
      [{ id: "a", task_name: "Fab", wbs_code: "4.1" }],
      new Map([["a", cpm(0)]]),
    );
    expect(flags[0].code).toBe("float_gone");
  });

  it("flags 12d baseline slip as watch", () => {
    const flags = flagFloatProtection(
      [{
        id: "a",
        task_name: "Fab",
        wbs_code: "4.1",
        start_date: "2026-06-13",
        metadata: { baseline_start: "2026-06-01", baseline_end: "2026-06-10" },
      }],
      new Map([["a", cpm(20)]]),
    );
    expect(flags.some((f) => f.code === "slip_window")).toBe(true);
  });
});
