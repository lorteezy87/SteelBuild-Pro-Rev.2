import { pieceTons } from "./tonnage";
import {
  PIECE_LIFECYCLE_STATUSES,
  type PieceLifecycleStatus,
} from "./types";
import type {
  StationCompletion,
  StationConfiguration,
} from "./stationProgress";

export const CANONICAL_LIFECYCLES = PIECE_LIFECYCLE_STATUSES;

export type CanonicalLifecycle = PieceLifecycleStatus;
export type DerivedWorkPackageStatus =
  | "No Canonical Scope"
  | "Ready for Release"
  | "Released"
  | "In Fabrication"
  | "Fabrication Complete"
  | "Shipping"
  | "Delivered"
  | "Erection"
  | "Complete";

export interface CanonicalRollupPiece {
  id: string;
  project_id: string;
  parent_piece_id: string | null;
  work_package_id: string | null;
  quantity: number;
  weight_each_lbs: number | null;
  weight_total_lbs: number | null;
  lifecycle_status: string;
  current_station: string | null;
  on_hold: boolean;
  is_container: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
}

export type LeafSelectablePiece = {
  id: string;
  parent_piece_id: string | null;
  is_container?: boolean;
  is_deleted?: boolean;
  deleted_at: string | null;
};

export interface CanonicalWorkPackage {
  id: string;
  project_id: string;
  wp_number?: string | null;
  name?: string | null;
  plannedShipDate?: string | null;
  planned_ship_date?: string | null;
  ship_date?: string | null;
  metadata?: Record<string, unknown> | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export interface CanonicalPieceRollup {
  lotCount: number;
  pieceCount: number;
  knownTons: number;
  unknownWeightLotCount: number;
  unknownWeightPieceCount: number;
  tonsByLifecycle: Record<string, number>;
  unknownWeightLotsByLifecycle: Record<string, number>;
}

export interface CanonicalWorkPackageRollup extends CanonicalPieceRollup {
  workPackageId: string;
  derivedStatus: DerivedWorkPackageStatus;
  earnedFabricationPercent: number | null;
  plannedShipDate: string | null;
}

export function selectActionableLeafPieces<T extends LeafSelectablePiece>(
  pieces: T[] | null | undefined,
): T[] {
  const active = (pieces ?? []).filter(
    (piece) => !piece.is_deleted && !piece.deleted_at,
  );
  const activeParentIds = new Set(
    active
      .map((piece) => piece.parent_piece_id)
      .filter((id): id is string => Boolean(id)),
  );
  return active.filter(
    (piece) => !piece.is_container && !activeParentIds.has(piece.id),
  );
}

export function rollupCanonicalPieces(
  pieces: CanonicalRollupPiece[],
): CanonicalPieceRollup {
  const actionable = selectActionableLeafPieces(pieces);
  const tonsByLifecycle: Record<string, number> = {};
  const unknownWeightLotsByLifecycle: Record<string, number> = {};
  let knownTons = 0;
  let unknownWeightLotCount = 0;
  let unknownWeightPieceCount = 0;

  for (const piece of actionable) {
    const lifecycle = piece.lifecycle_status || "not_started";
    const tons = pieceTons(piece);
    if (tons === null) {
      unknownWeightLotCount += 1;
      unknownWeightPieceCount += Number(piece.quantity) || 0;
      unknownWeightLotsByLifecycle[lifecycle] =
        (unknownWeightLotsByLifecycle[lifecycle] ?? 0) + 1;
    } else {
      knownTons += tons;
      tonsByLifecycle[lifecycle] = (tonsByLifecycle[lifecycle] ?? 0) + tons;
    }
  }

  return {
    lotCount: actionable.length,
    pieceCount: actionable.reduce(
      (total, piece) => total + (Number(piece.quantity) || 0),
      0,
    ),
    knownTons,
    unknownWeightLotCount,
    unknownWeightPieceCount,
    tonsByLifecycle,
    unknownWeightLotsByLifecycle,
  };
}

/**
 * Deterministic mixed-state precedence:
 * no scope; all erected; any erected; all delivered; any shipped/delivered;
 * all fabricated; any fabrication activity/fabricated; otherwise ready.
 */
export function deriveWorkPackageStatus(
  scopedPieces: CanonicalRollupPiece[],
): DerivedWorkPackageStatus {
  const pieces = selectActionableLeafPieces(scopedPieces);
  if (pieces.length === 0) return "No Canonical Scope";
  const statuses = pieces.map((piece) => piece.lifecycle_status);
  if (statuses.every((status) => status === "erected")) return "Complete";
  if (statuses.some((status) => status === "erected")) return "Erection";
  if (statuses.every((status) => status === "delivered")) return "Delivered";
  if (statuses.some((status) => status === "shipped" || status === "delivered")) {
    return "Shipping";
  }
  if (statuses.every((status) => status === "fabricated")) {
    return "Fabrication Complete";
  }
  if (
    statuses.some(
      (status) => status === "in_fabrication" || status === "fabricated",
    )
  ) {
    return "In Fabrication";
  }
  if (
    statuses.some((status) => status === "released") &&
    statuses.every(
      (status) => status === "not_started" || status === "released",
    )
  ) {
    return "Released";
  }
  return "Ready for Release";
}

/**
 * One pass over completion evidence for the entire snapshot. Duplicate station
 * completions earn once, using the active configuration's current percentage.
 */
function buildEarnedPercentIndex(
  configurations: StationConfiguration[],
  completions: StationCompletion[],
): Map<string, number> {
  const earnedByKey = new Map(
    configurations
      .filter((station) => station.is_active)
      .map((station) => [station.station_key, Number(station.earned_percent)]),
  );
  const completedByPiece = new Map<string, Set<StationCompletion["station_key"]>>();
  for (const completion of completions) {
    const pieceId = completion.piece_id;
    let keys = completedByPiece.get(pieceId);
    if (!keys) {
      keys = new Set();
      completedByPiece.set(pieceId, keys);
    }
    keys.add(completion.station_key);
  }
  const earnedByPiece = new Map<string, number>();
  for (const [pieceId, keys] of completedByPiece) {
    let earned = 0;
    for (const key of keys) earned += earnedByKey.get(key) ?? 0;
    earnedByPiece.set(pieceId, Math.min(100, earned));
  }
  return earnedByPiece;
}

function weightedFabricationPercent(
  actionablePieces: CanonicalRollupPiece[],
  earnedByPiece: Map<string, number>,
): number | null {
  let knownTons = 0;
  let earnedTons = 0;
  for (const piece of actionablePieces) {
    const tons = pieceTons(piece);
    if (tons === null) continue;
    knownTons += tons;
    earnedTons += tons * (earnedByPiece.get(piece.id) ?? 0);
  }
  return knownTons > 0 ? earnedTons / knownTons : null;
}

export function tonnageWeightedFabricationPercent(
  pieces: CanonicalRollupPiece[],
  configurations: StationConfiguration[],
  completions: StationCompletion[],
): number | null {
  return weightedFabricationPercent(
    selectActionableLeafPieces(pieces),
    buildEarnedPercentIndex(configurations, completions),
  );
}

export function plannedShipDateFor(
  workPackage: CanonicalWorkPackage,
): string | null {
  const metadataDate =
    workPackage.metadata &&
    typeof workPackage.metadata.plannedShipDate === "string"
      ? workPackage.metadata.plannedShipDate
      : null;
  return (
    workPackage.plannedShipDate ??
    workPackage.planned_ship_date ??
    workPackage.ship_date ??
    metadataDate ??
    null
  );
}

export function rollupCanonicalWorkPackages(
  workPackages: CanonicalWorkPackage[],
  pieces: CanonicalRollupPiece[],
  configurations: StationConfiguration[],
  completions: StationCompletion[],
): CanonicalWorkPackageRollup[] {
  const actionable = selectActionableLeafPieces(pieces);
  const earnedByPiece = buildEarnedPercentIndex(configurations, completions);
  const piecesByWorkPackage = new Map<string, CanonicalRollupPiece[]>();
  for (const piece of actionable) {
    if (!piece.work_package_id) continue;
    const scope = piecesByWorkPackage.get(piece.work_package_id);
    if (scope) scope.push(piece);
    else piecesByWorkPackage.set(piece.work_package_id, [piece]);
  }
  return workPackages
    .filter((workPackage) => !workPackage.is_deleted && !workPackage.deleted_at)
    .map((workPackage) => {
      const scope = piecesByWorkPackage.get(workPackage.id) ?? [];
      return {
        workPackageId: workPackage.id,
        ...rollupCanonicalPieces(scope),
        derivedStatus: deriveWorkPackageStatus(scope),
        earnedFabricationPercent: weightedFabricationPercent(scope, earnedByPiece),
        plannedShipDate: plannedShipDateFor(workPackage),
      };
    });
}
