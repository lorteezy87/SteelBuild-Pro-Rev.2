import { describe, expect, it } from "vitest";
import {
  presentReadinessText,
  buildPilotReadinessExportRows,
} from "../pieceControlPilotReadinessHelpers";

describe("presentReadinessText", () => {
  it("rewrites canonical jargon", () => {
    expect(presentReadinessText("No active actionable canonical piece scope")).toMatch(
      /No active pieces/,
    );
    expect(presentReadinessText("canonical_release_gate")).toMatch(/fabrication release/);
  });
});

describe("buildPilotReadinessExportRows", () => {
  it("flattens report sections", () => {
    const rows = buildPilotReadinessExportRows({
      metrics: { pieces: 10 },
      data_quality_warnings: ["warn"],
      hard_release_blockers: ["hard"],
      pilot_transition_blockers: ["p"],
      live_transition_blockers: ["l"],
    });
    expect(rows.length).toBe(5);
    expect(rows[0][0]).toBe("Metric");
  });
  it("returns empty without report", () => {
    expect(buildPilotReadinessExportRows(null)).toEqual([]);
  });
});
