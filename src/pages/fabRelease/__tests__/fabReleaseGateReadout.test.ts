import { describe, expect, it, vi } from "vitest";
import type { CanonicalReleaseGate, ReleaseGateCheck } from "@/lib/pieceControl/releaseRepository";
import { buildFabReleaseMetrics, fabReleaseLane } from "../analytics";
import { applyCanonicalGateReadout, releaseBlockerSummary } from "../fabReleaseControlCenter.derive";
import { isFabReleaseSnapshotCurrent, loadCanonicalFabReleaseGates, MAX_VERIFIED_PACKAGES, selectFabReleaseGatePackageIds } from "../fabReleaseGateLoader";
import { exportFabReleaseCSV } from "../exportCsv";
import { presentGeneratedFile } from "@/lib/native/fileExport";

vi.mock("@/lib/native/fileExport", () => ({ presentGeneratedFile: vi.fn() }));

const projectId = "project-1";
const packageId = "package-1";

function locallyReadyPackage() {
  return buildFabReleaseMetrics(
    [{
      id: packageId,
      project_id: projectId,
      wp_number: "WP-014",
      phase: "Fabrication",
      status: "Not Started",
      linked_drawing_ids: "drawing-1",
      vif_confirmed: true,
      load_list_complete: true,
      sequence_confirmed: true,
      shop_hours_budget: 100,
      crew: "Shop A",
    }],
    [{ id: "drawing-1", drawing_set_id: "set-1", stage: "IFC", sheet_number: "S-201" }],
    [{ id: "set-1", set_name: "Main steel" }],
  );
}

function gate(overrides: Partial<CanonicalReleaseGate> = {}): CanonicalReleaseGate {
  return {
    work_package_id: packageId,
    project_id: projectId,
    passes: false,
    already_released: false,
    checks: {
      scope: { passed: true, blockers: [] },
      drawings: { passed: false, blockers: ["Main steel: S-201 has an active drawing hold"] },
      material: { passed: false, blockers: ["1 material requirement is not received or on hand"] },
      holds: { passed: true, blockers: [] },
    },
    blockers: ["Main steel: S-201 has an active drawing hold", "1 material requirement is not received or on hand"],
    evaluated_at: "2026-10-08T17:00:00Z",
    ...overrides,
  };
}

function passingGate(overrides: Partial<CanonicalReleaseGate> = {}): CanonicalReleaseGate {
  const passed: ReleaseGateCheck = { passed: true, blockers: [] };
  return gate({
    passes: true,
    checks: { scope: passed, drawings: passed, material: passed, holds: passed },
    blockers: [],
    ...overrides,
  });
}

describe("Fab Release canonical gate readout", () => {
  it("does not present a locally ready package as releasable when the server blocks its drawing and material", () => {
    const advisory = locallyReadyPackage();
    expect(advisory.readyForRelease.map((wp) => wp.id)).toEqual([packageId]);
    expect(advisory.enriched[0]._signals.readinessScore).toBeGreaterThanOrEqual(80);
    const metrics = applyCanonicalGateReadout(advisory, projectId, { [packageId]: gate() }, true);
    const row = metrics.enriched[0];

    expect(metrics.readyForRelease).toHaveLength(0);
    expect(metrics.releaseBlocked.map((wp) => wp.id)).toEqual([packageId]);
    expect(fabReleaseLane(row)).toBe("Blocked");
    expect(releaseBlockerSummary(row)).toContain("S-201 has an active drawing hold");
    expect(releaseBlockerSummary(row)).toContain("material requirement is not received");
  });

  it("keeps missing, failed, mismatched, or contradictory gate results unverified", () => {
    for (const result of [
      undefined,
      null,
      passingGate({ project_id: "other-project" }),
      passingGate({ work_package_id: "other-package" }),
      passingGate({ blockers: ["S-201 is held"] }),
    ]) {
      const metrics = applyCanonicalGateReadout(
        locallyReadyPackage(), projectId,
        result === undefined ? {} : { [packageId]: result }, true,
      );
      expect(metrics.readyForRelease).toHaveLength(0);
      expect(metrics.releaseBlocked).toHaveLength(0);
      expect(fabReleaseLane(metrics.enriched[0])).toBe("Unverified");
      expect(releaseBlockerSummary(metrics.enriched[0])).toMatch(/not verified|unavailable/i);
    }
  });

  it("shows Ready only from a matching, passing server gate after the complete snapshot arrives", () => {
    const passing = passingGate();
    const pending = applyCanonicalGateReadout(locallyReadyPackage(), projectId, { [packageId]: passing }, false);
    const complete = applyCanonicalGateReadout(locallyReadyPackage(), projectId, { [packageId]: passing }, true);

    expect(pending.readyForRelease).toHaveLength(0);
    expect(complete.readyForRelease.map((wp) => wp.id)).toEqual([packageId]);
    expect(fabReleaseLane(complete.enriched[0])).toBe("Ready For Release");
  });

  it("isolates a rejected RPC and limits concurrent gate checks", async () => {
    const ids = Array.from({ length: 15 }, (_, index) => `package-${index}`);
    let active = 0;
    let peak = 0;
    const evaluate = vi.fn(async (id: string): Promise<CanonicalReleaseGate> => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      if (id === "package-4") throw new Error("RPC unavailable");
      return gate({ work_package_id: id });
    });

    const results = await loadCanonicalFabReleaseGates(ids, evaluate);
    expect(evaluate).toHaveBeenCalledTimes(15);
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1);
    expect(results["package-4"]).toBeNull();
    expect(results["package-14"]?.work_package_id).toBe("package-14");
  });

  it("bounds large-project checks and prioritizes active packages without a release stamp", () => {
    const unreleased = Array.from({ length: MAX_VERIFIED_PACKAGES + 5 }, (_, index) => ({
      id: `active-${index}`,
      wp_number: `WP-${index}`,
    }));
    const released = { id: "released", wp_number: "WP-999", released_date: "2026-10-01" };
    const deleted = { id: "deleted", wp_number: "WP-1000", is_deleted: true };
    const ids = selectFabReleaseGatePackageIds([released, deleted, ...unreleased]);

    expect(ids).toHaveLength(MAX_VERIFIED_PACKAGES);
    expect(ids).not.toContain("released");
    expect(ids).not.toContain("deleted");
    expect(ids[0]).toBe(`active-${MAX_VERIFIED_PACKAGES + 4}`);
  });

  it("expires stale, paused, or refreshing query results before they can show Ready", () => {
    const fresh = { isSuccess: true, isFetching: false, isStale: false, isError: false, fetchStatus: "idle", dataUpdatedAt: 200 };
    expect(isFabReleaseSnapshotCurrent(fresh, fresh, true, "pilot")).toBe(true);
    expect(isFabReleaseSnapshotCurrent(fresh, { ...fresh, dataUpdatedAt: 199 }, true, "pilot")).toBe(false);
    expect(isFabReleaseSnapshotCurrent({ ...fresh, isError: true }, fresh, true, "pilot")).toBe(false);
    expect(isFabReleaseSnapshotCurrent(fresh, { ...fresh, isStale: true }, true, "pilot")).toBe(false);
    expect(isFabReleaseSnapshotCurrent(fresh, { ...fresh, fetchStatus: "paused" }, true, "pilot")).toBe(false);
    expect(isFabReleaseSnapshotCurrent({ ...fresh, isFetching: true }, fresh, true, "pilot")).toBe(false);
    expect(isFabReleaseSnapshotCurrent({ ...fresh, isStale: true }, fresh, true, "pilot")).toBe(false);
    expect(isFabReleaseSnapshotCurrent(fresh, fresh, true, "off")).toBe(false);
  });

  it("exports verified blockers separately from the advisory planning score", async () => {
    const metrics = applyCanonicalGateReadout(locallyReadyPackage(), projectId, { [packageId]: gate() }, true);
    const present = vi.mocked(presentGeneratedFile);
    present.mockClear();
    exportFabReleaseCSV(metrics.enriched);

    expect(present).toHaveBeenCalledOnce();
    const csv = await present.mock.calls[0][0].blob.text();
    expect(csv).toContain("Release Verification,Release Blockers,Advisory Planning Score");
    expect(csv).toContain("Release blocked");
    expect(csv).toContain("S-201 has an active drawing hold");
    expect(csv).toContain("material requirement is not received or on hand");
  });

  it("neutralizes formula-leading package names and release blockers in CSV", async () => {
    const metrics = applyCanonicalGateReadout(locallyReadyPackage(), projectId, { [packageId]: gate() }, true);
    metrics.enriched[0].name = "=HYPERLINK(\"https://bad.example\",\"Open\")";
    metrics.enriched[0]._signals.releaseGate!.blockers = ["+SUM(A1:A2)"];
    const present = vi.mocked(presentGeneratedFile);
    present.mockClear();
    exportFabReleaseCSV(metrics.enriched);

    const csv = await present.mock.calls[0][0].blob.text();
    expect(csv).toContain("'=");
    expect(csv).toContain("'+SUM(A1:A2)");
    expect(csv).not.toContain('\"=HYPERLINK');
  });
});
