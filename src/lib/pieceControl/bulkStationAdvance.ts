import type { PieceRegisterRow } from "./repository";
import type { StationCompletion, StationConfiguration } from "./stationProgress";

export type BulkStationAdvanceMode = "next" | "station";

export interface BulkStationAdvancePlan {
  mode: BulkStationAdvanceMode;
  stationKey: string | null;
  eligiblePieceIds: string[];
  skipped: Array<{ pieceId: string; reason: string }>;
}

function isActionableLeaf(piece: PieceRegisterRow): boolean {
  return !piece.is_container && !piece.is_deleted;
}

function completedStationKeys(
  pieceId: string,
  completions: StationCompletion[],
): Set<string> {
  return new Set(
    completions
      .filter((completion) => completion.piece_id === pieceId)
      .map((completion) => completion.station_key),
  );
}

export function nextIncompleteStationKey(
  pieceId: string,
  stations: StationConfiguration[],
  completions: StationCompletion[],
): string | null {
  const done = completedStationKeys(pieceId, completions);
  const ordered = [...stations]
    .filter((station) => station.is_active)
    .sort((left, right) => left.sort_order - right.sort_order);
  return ordered.find((station) => !done.has(station.station_key))?.station_key ?? null;
}

/**
 * Client-side eligibility for bulk station advance UI.
 * Server still enforces release/hold/leaf rules atomically.
 */
export function planBulkStationAdvance(args: {
  mode: BulkStationAdvanceMode;
  stationKey?: string | null;
  selectedPieceIds: string[];
  pieces: PieceRegisterRow[];
  stations: StationConfiguration[];
  completions: StationCompletion[];
  releasedWorkPackageIds: string[];
}): BulkStationAdvancePlan {
  const {
    mode,
    selectedPieceIds,
    pieces,
    stations,
    completions,
    releasedWorkPackageIds,
  } = args;
  const stationKey =
    mode === "station" ? (args.stationKey ?? null)?.trim().toLowerCase() || null : null;

  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const eligiblePieceIds: string[] = [];
  const skipped: Array<{ pieceId: string; reason: string }> = [];

  for (const pieceId of selectedPieceIds) {
    const piece = byId.get(pieceId);
    if (!piece) {
      skipped.push({ pieceId, reason: "Lot not in current production scope" });
      continue;
    }
    if (!isActionableLeaf(piece)) {
      skipped.push({ pieceId, reason: "Tracking rows are not physical piece lots" });
      continue;
    }
    if (piece.on_hold) {
      skipped.push({ pieceId, reason: "Lot is on hold" });
      continue;
    }
    if (
      piece.lifecycle_status === "shipped" ||
      piece.lifecycle_status === "delivered" ||
      piece.lifecycle_status === "erected"
    ) {
      skipped.push({ pieceId, reason: "Lot already left fabrication" });
      continue;
    }
    if (
      !piece.work_package_id ||
      !releasedWorkPackageIds.includes(piece.work_package_id)
    ) {
      skipped.push({ pieceId, reason: "Work-package release required" });
      continue;
    }

    if (mode === "next") {
      const nextKey = nextIncompleteStationKey(piece.id, stations, completions);
      if (!nextKey) {
        skipped.push({ pieceId, reason: "All stations already complete" });
        continue;
      }
      eligiblePieceIds.push(piece.id);
      continue;
    }

    if (!stationKey) {
      skipped.push({ pieceId, reason: "Station is required" });
      continue;
    }
    const done = completedStationKeys(piece.id, completions);
    if (done.has(stationKey)) {
      skipped.push({ pieceId, reason: "Station already complete" });
      continue;
    }
    eligiblePieceIds.push(piece.id);
  }

  return {
    mode,
    stationKey,
    eligiblePieceIds,
    skipped,
  };
}
