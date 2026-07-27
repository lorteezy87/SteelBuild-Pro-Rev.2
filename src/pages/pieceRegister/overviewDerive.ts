/**
 * Pure overview helpers for Piece Register — byte-identical extracts from
 * PieceRegister.tsx. Keep useMemo wrappers in the page; only move the bodies.
 */
import {
  rollupCanonicalWorkPackages,
  type CanonicalWorkPackage,
  type CanonicalWorkPackageRollup,
} from "@/lib/pieceControl/canonicalRollups";
import type { CanonicalDashboardSnapshot } from "@/lib/pieceControl/canonicalDashboardRepository";

export type OverviewWorkPackage = CanonicalWorkPackageRollup & {
  source: CanonicalWorkPackage | undefined;
};

export function formatPlannedShipDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    },
  );
}

export function workPackageStatusLabel(status: string): string {
  return status === "No Canonical Scope" ? "No active pieces" : status;
}

export function deriveOverviewWorkPackages(
  snapshot: CanonicalDashboardSnapshot | undefined,
): OverviewWorkPackage[] {
  if (!snapshot) return [];
  const sourceById = new Map(
    snapshot.workPackages.map((workPackage) => [workPackage.id, workPackage]),
  );
  return rollupCanonicalWorkPackages(
    snapshot.workPackages,
    snapshot.pieces,
    snapshot.stations,
    snapshot.completions,
  ).map((rollup) => ({
    ...rollup,
    source: sourceById.get(rollup.workPackageId),
  }));
}

export function selectUpcomingShipments(
  overviewWorkPackages: OverviewWorkPackage[],
): OverviewWorkPackage[] {
  return overviewWorkPackages
    .filter((workPackage) => Boolean(workPackage.plannedShipDate))
    .sort((left, right) =>
      String(left.plannedShipDate).localeCompare(
        String(right.plannedShipDate),
      ),
    )
    .slice(0, 8);
}
