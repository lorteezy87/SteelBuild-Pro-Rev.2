import { describe, expect, it } from "vitest";
import {
  CANONICAL_REPORTING_REALTIME_TABLES,
  canonicalReportingQueryKeys,
} from "./useCanonicalReportingRealtime";

describe("canonical reporting realtime scope", () => {
  it("subscribes only to project-scoped canonical reporting tables", () => {
    expect(CANONICAL_REPORTING_REALTIME_TABLES).toEqual([
      "pieces",
      "piece_events",
      "piece_drawings",
      "material_requirements",
      "fab_releases",
    ]);
  });

  it("invalidates project-specific canonical caches", () => {
    const keys = canonicalReportingQueryKeys("project-1");
    expect(keys).toContainEqual(["canonical-reporting", "project-1"]);
    expect(keys).toContainEqual(["canonical-pieces-3d", "project-1"]);
    expect(keys.every((key) => key[1] === "project-1")).toBe(true);
  });
});

