import {
  nextIncompleteStationKey,
  planBulkStationAdvance,
} from "@/lib/pieceControl/bulkStationAdvance";
import type {
  LotAllocation,
  ProductionSnapshot,
} from "@/lib/pieceControl/productionRepository";
import type { PieceRegisterRow } from "@/lib/pieceControl/repository";
import {
  calculateWeightedProductionProgress,
  groupPiecesByCurrentStation,
} from "@/lib/pieceControl/stationProgress";

export interface DerivePieceProductionViewInput {
  snapshot: ProductionSnapshot;
  selectedPieceId: string | null;
  splitRows: LotAllocation[];
  bulkSelectedIds: string[];
  bulkStationKey: string;
}

export function selectProductionPiece(
  pieces: PieceRegisterRow[],
  selectedPieceId: string | null,
): PieceRegisterRow | null {
  return (
    pieces.find((piece) => piece.id === selectedPieceId) ??
    pieces.find((piece) => !piece.is_container) ??
    null
  );
}

export function derivePieceProductionView({
  snapshot,
  selectedPieceId,
  splitRows,
  bulkSelectedIds,
  bulkStationKey,
}: DerivePieceProductionViewInput) {
  const { pieces, stations, completions } = snapshot;
  const selectedPiece = selectProductionPiece(pieces, selectedPieceId);
  const grouped = groupPiecesByCurrentStation(pieces);
  const progress = calculateWeightedProductionProgress(
    pieces,
    stations,
    completions,
  );
  const selectedCompletions = selectedPiece
    ? completions.filter((completion) => completion.piece_id === selectedPiece.id)
    : [];
  const completedKeys = new Set(
    selectedCompletions.map((completion) => completion.station_key),
  );
  const nextStation = stations.find(
    (station) => !completedKeys.has(station.station_key),
  );
  const splitTotal = splitRows.reduce(
    (total, row) => total + (Number(row.quantity) || 0),
    0,
  );
  const normalizedLotCodes = splitRows.map((row) =>
    row.lot_code.trim().toUpperCase(),
  );
  const splitValid =
    Boolean(selectedPiece) &&
    !selectedPiece!.is_container &&
    splitRows.length >= 2 &&
    splitRows.every(
      (row) =>
        row.lot_code.trim() &&
        row.lot_code.trim().toUpperCase() !== "ALL" &&
        Number(row.quantity) > 0,
    ) &&
    new Set(normalizedLotCodes).size === normalizedLotCodes.length &&
    splitTotal === Number(selectedPiece!.quantity);
  const released =
    Boolean(selectedPiece?.work_package_id) &&
    snapshot.canonicalReleaseWorkPackageIds.includes(
      selectedPiece!.work_package_id!,
    );
  const stationDisabledReason = selectedPiece?.on_hold
    ? "Release the hold before recording production."
    : selectedPiece?.is_container
      ? "Tracking rows are not physical piece lots."
      : !released
        ? "Work-package release required"
        : null;
  const leafPieces = pieces.filter((piece) => !piece.is_container);
  const bulkNextPlan = planBulkStationAdvance({
    mode: "next",
    selectedPieceIds: bulkSelectedIds,
    pieces,
    stations,
    completions,
    releasedWorkPackageIds: snapshot.canonicalReleaseWorkPackageIds,
  });
  const bulkStationPlan = planBulkStationAdvance({
    mode: "station",
    stationKey: bulkStationKey || null,
    selectedPieceIds: bulkSelectedIds,
    pieces,
    stations,
    completions,
    releasedWorkPackageIds: snapshot.canonicalReleaseWorkPackageIds,
  });
  const bulkNeedsOverride =
    Boolean(bulkStationKey) &&
    bulkStationPlan.eligiblePieceIds.some((pieceId) => {
      const nextKey = nextIncompleteStationKey(pieceId, stations, completions);
      return Boolean(nextKey && nextKey !== bulkStationKey);
    });

  return {
    pieces,
    stations,
    completions,
    selectedPiece,
    grouped,
    progress,
    selectedCompletions,
    nextStation,
    splitTotal,
    splitValid,
    released,
    stationDisabledReason,
    leafPieces,
    bulkNextPlan,
    bulkStationPlan,
    bulkNeedsOverride,
  };
}
