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

    const byStage = counts as Record<string, number>;
    expect(stages).toContain("R&R");
    expect(byStage["R&R"]).toBe(1);
    expect(byStage["OFS"]).toBe(1);
    expect(byStage["IFC"]).toBe(1);
    expect(byStage["Released"]).toBe(1);
    expect(total).toBe(4);
  });
});
