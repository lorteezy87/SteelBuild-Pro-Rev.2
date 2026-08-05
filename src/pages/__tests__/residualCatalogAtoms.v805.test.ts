import { describe, expect, it } from "vitest";
import { DETAILING_IMPACT_SEVERITY_RANK } from "@/lib/detailingRevisionImpact";
import { SEVERITY_RANK as SNAPSHOT_SEVERITY_RANK } from "@/lib/revisionSnapshotDiff";
import ImportStatChip from "@/components/shared/ImportStatChip";

describe("residual catalog atoms batch V", () => {
  it("detailing impact severity rank (no info tier)", () => {
    expect(DETAILING_IMPACT_SEVERITY_RANK.critical).toBe(0);
    expect(DETAILING_IMPACT_SEVERITY_RANK.low).toBe(3);
    expect(DETAILING_IMPACT_SEVERITY_RANK).not.toHaveProperty("info");
    // snapshot rank keeps info for AI deltas
    expect(SNAPSHOT_SEVERITY_RANK.info).toBe(4);
  });

  it("ImportStatChip is a presentational component", () => {
    expect(typeof ImportStatChip).toBe("function");
    expect(ImportStatChip.name).toBe("ImportStatChip");
  });
});
