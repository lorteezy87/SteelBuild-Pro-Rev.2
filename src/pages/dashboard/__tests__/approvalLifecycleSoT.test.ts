import { describe, expect, it } from "vitest";
import { submittalPipelineRollupFromSubmittals } from "../projectMetrics";

describe("dashboard approval lifecycle SoT (Slice 9)", () => {
  it("counts R&R as its own bucket and IFC separately from OFS", () => {
    const { counts, stages, total } = submittalPipelineRollupFromSubmittals([
      { id: "1", status: "Revise and Resubmit", ball_in_court: "Detailer" },
      { id: "2", status: "Approved as Noted", ball_in_court: "Detailer" }, // OFS
      { id: "3", status: "Approved", ball_in_court: "GC" }, // IFC
      { id: "4", status: "Released for Fabrication", ball_in_court: null },
    ]);

    expect(stages).toContain("R&R");
    expect(counts["R&R"]).toBe(1);
    expect(counts["OFS"]).toBe(1);
    expect(counts["IFC"]).toBe(1);
    expect(counts["Released"]).toBe(1);
    expect(total).toBe(4);
  });
});
