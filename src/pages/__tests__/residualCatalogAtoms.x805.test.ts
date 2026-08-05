import { describe, expect, it } from "vitest";
import {
  SEV_LABEL,
  SEV_TO_IMPACT,
  IMPACT_RANK,
  RANK_IMPACT,
} from "@/lib/revisionSummary";
import { RFI_DEDUP_WEIGHT } from "@/lib/rfiDedup";
import { RISK_AGING_THRESHOLDS } from "@/lib/submittalRiskAging";

describe("residual catalog atoms batch X", () => {
  it("revision summary severity maps", () => {
    expect(SEV_LABEL.critical).toBe("in the field");
    expect(SEV_LABEL.low).toBeNull();
    expect(SEV_TO_IMPACT.high).toBe("medium");
    expect(IMPACT_RANK.high).toBe(3);
    expect(RANK_IMPACT[0]).toBe("none");
  });

  it("rfi dedup weights and submittal risk aging thresholds", () => {
    expect(RFI_DEDUP_WEIGHT.drawingReference).toBe(0.25);
    expect(RFI_DEDUP_WEIGHT.drawingSet).toBe(0.1);
    expect(RISK_AGING_THRESHOLDS.ATTENTION_MAX_WD).toBe(5);
    expect(RISK_AGING_THRESHOLDS.STUCK_CRITICAL_WD).toBe(6);
  });
});
