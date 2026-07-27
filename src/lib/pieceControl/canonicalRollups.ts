import { pieceTons } from "./tonnage";
import type {
  StationCompletion,
  StationConfiguration,
} from "./stationProgress";

export const CANONICAL_LIFECYCLES = [
  "not_started",
  "released",
  "in_fabrication",
  "fabricated",
  "shipped",
  "delivered",
  "erected",
] as const;

export type CanonicalLifecycle = (typeof CANONICAL_LIFECYCLES)[number];
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

function earnedPercentForPiece(
  pieceId: string,
  configurations: StationConfiguration[],
  completions: StationCompletion[],
): number {
  const earnedByKey = new Map(
    configurations
      .filter((station) => station.is_active)
      .map((station) => [station.station_key, Number(station.earned_percent)]),
  );
  const completedKeys = new Set(
    completions
      .filter((completion) => completion.piece_id === pieceId)
      .map((completion) => completion.station_key),
  );
  return Math.min(
    100,
    [...completedKeys].reduce(
      (total, key) => total + (earnedByKey.get(key) ?? 0),
      0,
    ),
  );
}

export function tonnageWeightedFabricationPercent(
  pieces: CanonicalRollupPiece[],
  configurations: StationConfiguration[],
  completions: StationCompletion[],
): number | null {
  const weighted = selectActionableLeafPieces(pieces)
    .map((piece) => ({
      tons: pieceTons(piece),
      earned: earnedPercentForPiece(piece.id, configurations, completions),
    }))
    .filter(
      (entry): entry is { tons: number; earned: number } =>
        entry.tons !== null,
    );
  const knownTons = weighted.reduce((total, entry) => total + entry.tons, 0);
  if (knownTons <= 0) return null;
  return (
    weighted.reduce(
      (total, entry) => total + entry.tons * entry.earned,
      0,
    ) / knownTons
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
  return workPackages
    .filter((workPackage) => !workPackage.is_deleted && !workPackage.deleted_at)
    .map((workPackage) => {
      const scope = actionable.filter(
        (piece) => piece.work_package_id === workPackage.id,
      );
      return {
        workPackageId: workPackage.id,
        ...rollupCanonicalPieces(scope),
        derivedStatus: deriveWorkPackageStatus(scope),
        earnedFabricationPercent: tonnageWeightedFabricationPercent(
          scope,
          configurations,
          completions,
        ),
        plannedShipDate: plannedShipDateFor(workPackage),
      };
    });
}

