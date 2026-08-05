import { describe, expect, it } from "vitest";
import {
  HEATMAP_WEIGHTS,
  READINESS_DRAWING_STAGE_SCORES,
  STATUS_THRESHOLDS,
} from "@/lib/drawingHub/statusEngineHelpers";
import {
  FINDING_TYPE_TO_ZONE_TYPE,
  SEVERITY_WEIGHTS,
} from "@/lib/drawingHub/proposalsHelpers";
import { SCOPE_TYPES } from "@/lib/wbsBuilder";
import { computeZoneDensity } from "@/lib/drawingHub/statusEngine";

describe("residual catalog atoms batch O", () => {
  it("heatmap and readiness catalogs", () => {
    expect(HEATMAP_WEIGHTS.rfiOverdue).toBe(5);
    expect(HEATMAP_WEIGHTS.otherActivity).toBe(0.25);
    expect(READINESS_DRAWING_STAGE_SCORES.Released).toBe(100);
    expect(READINESS_DRAWING_STAGE_SCORES.IFA).toBe(10);
    expect(STATUS_THRESHOLDS.AI_WARN_CONFIDENCE).toBe(0.8);
  });

  it("proposal maps and wbs scope types", () => {
    expect(FINDING_TYPE_TO_ZONE_TYPE.callout_issue).toBe("detail");
    expect(FINDING_TYPE_TO_ZONE_TYPE.aess_concern).toBe("member_group");
    expect(SEVERITY_WEIGHTS.critical).toBe(0.95);
    expect(SEVERITY_WEIGHTS.info).toBe(0.4);
    expect(SCOPE_TYPES.column.label).toBe("Columns");
    expect(SCOPE_TYPES.beam.phases.length).toBeGreaterThan(0);
  });

  it("zone density still uses heatmap weights", () => {
    const score = computeZoneDensity([
      {
        link: { linked_record_type: "rfi", is_confirmed: true },
        record: { status: "Open", date_required: "2000-01-01" },
      },
    ]);
    expect(score).toBe(HEATMAP_WEIGHTS.rfiOverdue);
  });
});
