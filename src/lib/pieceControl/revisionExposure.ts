import { isRfiOpen } from "@/lib/entityPredicates";
import { selectActionableLeafPieces } from "./canonicalRollups";
import type { PieceRegisterRow } from "./repository";
import type {
  ExposureLifecycle,
  ImpactVerification,
  PieceIntelligenceRevision,
  PieceIntelligenceSnapshot,
  RevisionExposureRow,
} from "./pieceIntelligenceTypes";

const exposureLifecycles: ExposureLifecycle[] = [
  "not_started",
  "released",
  "in_fabrication",
  "fabricated",
  "shipped",
  "delivered",
  "erected",
];

function indexIds(
  links: Array<{ piece_id: string; drawing_set_id?: string; drawing_id?: string }>,
  foreignKey: "drawing_set_id" | "drawing_id",
): Map<string, Set<string>> {
  const pieceIdsByForeignKey = new Map<string, Set<string>>();
  for (const link of links) {
    const foreignId = link[foreignKey];
    if (!foreignId) continue;
    const pieceIds = pieceIdsByForeignKey.get(foreignId) ?? new Set<string>();
    pieceIds.add(link.piece_id);
    pieceIdsByForeignKey.set(foreignId, pieceIds);
  }
  return pieceIdsByForeignKey;
}

function createExposure(): Record<ExposureLifecycle, number> {
  return {
    not_started: 0,
    released: 0,
    in_fabrication: 0,
    fabricated: 0,
    shipped: 0,
    delivered: 0,
    erected: 0,
  };
}

function exposureLifecycleFor(status: string): ExposureLifecycle {
  return exposureLifecycles.includes(status as ExposureLifecycle)
    ? status as ExposureLifecycle
    : "not_started";
}

function verificationFor(
  affectedPieceIds: string[],
  snapshot: PieceIntelligenceSnapshot,
): ImpactVerification {
  if (affectedPieceIds.length === 0) return "link_required";
  if (
    snapshot.availability.relationships === "unavailable" ||
    snapshot.availability.impacts === "unavailable" ||
    snapshot.availability.rfis === "unavailable"
  ) {
    return "partial";
  }
  return "verified";
}

function buildRevisionRow(
  revision: PieceIntelligenceRevision,
  snapshot: PieceIntelligenceSnapshot,
  pieceById: Map<string, PieceRegisterRow>,
  setLinks: Map<string, Set<string>>,
  drawingLinks: Map<string, Set<string>>,
): RevisionExposureRow {
  const drawing = snapshot.drawings.find((candidate) => candidate.id === revision.drawing_id);
  const linkedPieceIds = new Set<string>(
    drawing?.drawing_set_id ? setLinks.get(drawing.drawing_set_id) : undefined,
  );
  for (const pieceId of drawingLinks.get(revision.drawing_id) ?? []) {
    linkedPieceIds.add(pieceId);
  }

  const affectedPieces = [...linkedPieceIds]
    .map((pieceId) => pieceById.get(pieceId))
    .filter((piece): piece is PieceRegisterRow => Boolean(piece))
    .sort((left, right) => left.id.localeCompare(right.id));
  const affectedPieceIds = affectedPieces.map((piece) => piece.id);
  const affectedWorkPackageIds = [...new Set(
    affectedPieces
      .map((piece) => piece.work_package_id)
      .filter((workPackageId): workPackageId is string => Boolean(workPackageId)),
  )].sort();
  const exposure = createExposure();
  for (const piece of affectedPieces) {
    exposure[exposureLifecycleFor(piece.lifecycle_status)] += 1;
  }

  return {
    revisionId: revision.id,
    drawingId: revision.drawing_id,
    drawingSetId: drawing?.drawing_set_id ?? null,
    sheetNumber: drawing?.sheet_number ?? "",
    revisionCode: revision.revision_code ?? "",
    affectedPieceIds,
    affectedWorkPackageIds,
    verification: verificationFor(affectedPieceIds, snapshot),
    exposure,
    heldCount: affectedPieces.filter((piece) => piece.on_hold).length,
    openImpactCount: snapshot.drawingImpacts.filter((impact) =>
      impact.drawing_revision_id === revision.id &&
      impact.status !== "resolved" &&
      impact.status !== "closed",
    ).length,
    openRfiCount: snapshot.rfis.filter((rfi) =>
      rfi.work_package_id !== null &&
      rfi.work_package_id !== undefined &&
      affectedWorkPackageIds.includes(rfi.work_package_id) &&
      isRfiOpen(rfi),
    ).length,
  };
}

function compareRevisionExposure(left: RevisionExposureRow, right: RevisionExposureRow): number {
  return left.sheetNumber.localeCompare(right.sheetNumber) ||
    left.revisionCode.localeCompare(right.revisionCode) ||
    left.revisionId.localeCompare(right.revisionId);
}

export function deriveRevisionExposure(
  snapshot: PieceIntelligenceSnapshot,
): RevisionExposureRow[] {
  const actionable = selectActionableLeafPieces(snapshot.pieces);
  const pieceById = new Map(actionable.map((piece) => [piece.id, piece]));
  const setLinks = indexIds(snapshot.pieceDrawingSets, "drawing_set_id");
  const drawingLinks = indexIds(snapshot.pieceDrawings, "drawing_id");
  return snapshot.drawingRevisions
    .filter((revision) => revision.is_current && !revision.archived_at)
    .map((revision) => buildRevisionRow(revision, snapshot, pieceById, setLinks, drawingLinks))
    .sort(compareRevisionExposure);
}
