import { describe, expect, it, vi } from "vitest";
import { canStartFabPackageCreation, reserveFabReleaseNumber } from "../creation";
import { filterFabReleasePackages } from "../filter";
import { normalizeFabReleaseStage, normalizeFabReleaseView } from "../view";

describe("Fab Release parity helpers", () => {
  it("normalizes supported views and legacy aliases", () => {
    expect(normalizeFabReleaseView("pipeline")).toBe("flow");
    expect(normalizeFabReleaseView("list")).toBe("register");
    expect(normalizeFabReleaseView("hours")).toBe("hours");
    expect(normalizeFabReleaseView("unknown")).toBeNull();
  });

  it("normalizes stage ids, short labels, all, and invalid values", () => {
    expect(normalizeFabReleaseStage("all")).toBe("all");
    expect(normalizeFabReleaseStage("shop_released")).toBe("shop_released");
    expect(normalizeFabReleaseStage("REL")).toBe("shop_released");
    expect(normalizeFabReleaseStage("unknown")).toBeNull();
  });

  it("filters by broad search fields, stage, risk, and sequence", () => {
    const rows = [
      {
        id: "one",
        wp_number: "WP-001",
        name: "North roof",
        project_name: "Main project",
        crew: "Crew A",
        status: "In Progress",
        phase: "Fabrication",
        notes: "rush",
        area: "A",
        sequence_number: 1,
        _signals: {
          stage: "fabrication",
          risk: "high",
          drawing: { packageNames: ["Roof package"] },
          flags: [{ label: "Missing drawing" }],
        },
      },
      {
        id: "two",
        wp_number: "WP-002",
        name: "South stairs",
        project_name: "Main project",
        crew: "Crew B",
        status: "Complete",
        phase: "Erection",
        notes: "",
        area: "B",
        sequence_number: 2,
        _signals: {
          stage: "shop_released",
          risk: "low",
          drawing: { packageNames: ["Stair package"] },
          flags: [],
        },
      },
    ] as any;

    expect(filterFabReleasePackages(rows, { search: "roof package" })).toHaveLength(1);
    expect(filterFabReleasePackages(rows, { stageFilter: "fabrication" })).toEqual([rows[0]]);
    expect(filterFabReleasePackages(rows, { riskFilter: "high" })).toEqual([rows[0]]);
    expect(filterFabReleasePackages(rows, { seqFilter: "B" })).toEqual([rows[1]]);
  });

  it("fails closed for missing context and duplicate create attempts", () => {
    expect(canStartFabPackageCreation({ projectId: null, allocationInFlight: false, modalOpen: false, editing: null })).toBe(false);
    expect(canStartFabPackageCreation({ projectId: "p1", allocationInFlight: true, modalOpen: false, editing: null })).toBe(false);
    expect(canStartFabPackageCreation({ projectId: "p1", allocationInFlight: false, modalOpen: true, editing: null })).toBe(false);
    expect(canStartFabPackageCreation({ projectId: "p1", allocationInFlight: false, modalOpen: false, editing: null })).toBe(true);
  });

  it("uses the official allocator record type and formats the number", async () => {
    const allocate = vi.fn().mockResolvedValue(7);
    await expect(reserveFabReleaseNumber("p1", allocate)).resolves.toBe("WP-007");
    expect(allocate).toHaveBeenCalledWith("p1", "wp_number");
  });

  it("propagates allocator failures", async () => {
    const error = new Error("allocator unavailable");
    await expect(reserveFabReleaseNumber("p1", vi.fn().mockRejectedValue(error))).rejects.toBe(error);
  });
});
