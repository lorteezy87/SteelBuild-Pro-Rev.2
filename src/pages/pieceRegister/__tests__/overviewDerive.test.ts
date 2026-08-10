import { describe, expect, it } from "vitest";
import {
  deriveOverviewWorkPackages,
  formatPlannedShipDate,
  selectUpcomingShipments,
  type OverviewWorkPackage,
  workPackageStatusLabel,
} from "../overviewDerive";
import type { CanonicalDashboardSnapshot } from "@/lib/pieceControl/canonicalDashboardRepository";

describe("overviewDerive", () => {
  it("formats planned ship dates in UTC", () => {
    expect(formatPlannedShipDate("2026-07-15")).toBe("Jul 15, 2026");
    expect(formatPlannedShipDate("2026-07-15T12:00:00.000Z")).toBe("Jul 15, 2026");
  });

  it("relabels no-scope work packages for operators", () => {
    expect(workPackageStatusLabel("No Canonical Scope")).toBe("No active pieces");
    expect(workPackageStatusLabel("In Fabrication")).toBe("In Fabrication");
  });

  it("returns empty when snapshot is missing", () => {
    expect(deriveOverviewWorkPackages(undefined)).toEqual([]);
  });

  it("attaches source work packages and filters upcoming shipments", () => {
    const snapshot = {
      pieces: [
        {
          id: "p1",
          work_package_id: "wp-1",
          quantity: 2,
          weight: 1000,
          lifecycle_status: "fabricated",
          is_deleted: false,
          deleted_at: null,
          is_container: false,
          parent_piece_id: null,
        },
      ],
      workPackages: [
        {
          id: "wp-1",
          wp_number: "WP-01",
          name: "North Sequence",
          planned_ship_date: "2026-08-01",
        },
        {
          id: "wp-2",
          wp_number: "WP-02",
          name: "South Sequence",
          planned_ship_date: null,
        },
      ],
      stations: [],
      completions: [],
      legacyProduction: [],
    } as unknown as CanonicalDashboardSnapshot;

    const overview = deriveOverviewWorkPackages(snapshot);
    expect(overview).toHaveLength(2);
    expect(overview[0].source?.wp_number).toBe("WP-01");

    const upcoming = selectUpcomingShipments(overview);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].workPackageId).toBe("wp-1");
  });

  it("caps upcoming shipments at eight, sorted by planned date", () => {
    const packages = Array.from(
      { length: 10 },
      (_, index): OverviewWorkPackage => ({
        workPackageId: `wp-${index}`,
        plannedShipDate: `2026-08-${String(10 - index).padStart(2, "0")}`,
        source: undefined,
        derivedStatus: "Ready for Release",
        earnedFabricationPercent: null,
        lotCount: 0,
        pieceCount: 0,
        knownTons: 0,
        unknownWeightLotCount: 0,
        unknownWeightPieceCount: 0,
        tonsByLifecycle: {},
        unknownWeightLotsByLifecycle: {},
      }),
    );

    const upcoming = selectUpcomingShipments(packages);
    expect(upcoming).toHaveLength(8);
    expect(upcoming[0].plannedShipDate).toBe("2026-08-01");
    expect(upcoming[7].plannedShipDate).toBe("2026-08-08");
  });

  it("keeps readiness rows when no work package has a planned shipment", () => {
    const packages: OverviewWorkPackage[] = [
      {
        workPackageId: "wp-1",
        plannedShipDate: null,
        source: undefined,
        derivedStatus: "Ready for Release",
        earnedFabricationPercent: 0,
        lotCount: 1,
        pieceCount: 3,
        knownTons: 1.5,
        unknownWeightLotCount: 0,
        unknownWeightPieceCount: 0,
        tonsByLifecycle: {},
        unknownWeightLotsByLifecycle: {},
      },
    ];

    expect(selectUpcomingShipments(packages)).toEqual([]);
    expect(packages).toHaveLength(1);
    expect(packages[0].pieceCount).toBe(3);
  });
});
