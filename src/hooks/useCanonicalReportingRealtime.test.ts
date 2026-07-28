import { describe, expect, it, vi } from "vitest";
import {
  CANONICAL_REPORTING_REALTIME_TABLES,
  canonicalReportingQueryKeys,
  invalidateCanonicalPieceCaches,
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

  it("invalidates project-specific canonical caches including 3D fab colors", () => {
    const keys = canonicalReportingQueryKeys("project-1");
    expect(keys).toContainEqual(["canonical-reporting", "project-1"]);
    expect(keys).toContainEqual(["canonical-pieces-3d", "project-1"]);
    expect(keys).toContainEqual(["piece-production", "project-1"]);
    expect(keys).toContainEqual(["piece-logistics", "project-1"]);
    expect(keys).toContainEqual(["piece-register", "project-1"]);
    expect(keys).toContainEqual(["canonical-release-gate"]);
    expect(
      keys
        .filter((key) => key[0] !== "canonical-release-gate")
        .every((key) => key[1] === "project-1"),
    ).toBe(true);
  });

  it("invalidateCanonicalPieceCaches hits every reporting key", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as any;
    await invalidateCanonicalPieceCaches(queryClient, "project-1");
    expect(invalidateQueries).toHaveBeenCalledTimes(
      canonicalReportingQueryKeys("project-1").length,
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["canonical-pieces-3d", "project-1"],
    });
  });
});

