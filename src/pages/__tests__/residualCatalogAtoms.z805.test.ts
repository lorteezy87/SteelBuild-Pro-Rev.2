import { describe, expect, it } from "vitest";
import {
  CLOSED_RFI_STATUSES,
  CLOSED_ACTION_STATUSES,
  DEFAULT_HEALTH_THRESHOLDS,
} from "@/services/portfolioHealthScoring";
import {
  STATUS_ORDER,
  CLOSED_STATUSES,
  ISSUE_STATUSES,
  PHASE_RANK,
} from "@/pages/deliveries/analytics";
import {
  VALID_DELTA_TYPES,
  VALID_SEVERITIES,
} from "@/lib/revisionSnapshotDiff";

describe("residual catalog atoms batch Z", () => {
  it("portfolio closed status sets and thresholds", () => {
    expect(CLOSED_RFI_STATUSES.has("closed")).toBe(true);
    expect(CLOSED_ACTION_STATUSES.has("complete")).toBe(true);
    expect(DEFAULT_HEALTH_THRESHOLDS.onTrack).toBe(76);
  });

  it("delivery analytics status catalogs", () => {
    expect(STATUS_ORDER[0]).toBe("Scheduled");
    expect(CLOSED_STATUSES.has("delivered")).toBe(true);
    expect(ISSUE_STATUSES.has("delayed")).toBe(true);
    expect(PHASE_RANK.Fabrication).toBe(1);
  });

  it("revision snapshot valid type/severity sets", () => {
    expect(VALID_DELTA_TYPES.has("grid_shift")).toBe(true);
    expect(VALID_SEVERITIES.has("info")).toBe(true);
    expect(VALID_SEVERITIES.has("bogus")).toBe(false);
  });
});
